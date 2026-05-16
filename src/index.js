// @ts-check

import assert from "node:assert";
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, ListQueuesCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import sharp from "sharp";

/**
 * @type {import('@aws-sdk/client-sqs').SQSClientConfig}
 */
const sqsOptions = {};

/**
 * @type {import('@aws-sdk/client-dynamodb').DynamoDBClientConfig}
 */
const dynamoDbOptions = {}

/**
 * @type {import('@aws-sdk/client-s3').S3ClientConfig}
 */
const s3Options = {
    forcePathStyle: true,
}

if (process.env.AWS_ENDPOINT_URL) {
    sqsOptions.endpoint = process.env.AWS_ENDPOINT_URL;
    dynamoDbOptions.endpoint = process.env.AWS_ENDPOINT_URL;
    s3Options.endpoint = process.env.AWS_ENDPOINT_URL
}

const s3 = new S3Client(s3Options);
const sqs = new SQSClient(sqsOptions);
const ddb = new DynamoDBClient(dynamoDbOptions);

/**
 * Convert a readable stream or Uint8Array body into a Buffer.
 * @typedef {{ getReader: () => { read: () => Promise<{ done: boolean, value?: Uint8Array }> } }} WebReadable
 * @typedef {Blob & { arrayBuffer: () => Promise<ArrayBuffer> }} WebBlob
 */
/**
 * @param {unknown} body
 * @returns {body is WebReadable}
 */
function isWebReadable(body) {
  return typeof body === "object" && body !== null && typeof /** @type {{ getReader?: unknown }} */ (body).getReader === "function";
}

/**
 * @param {unknown} body
 * @returns {body is WebBlob}
 */
function isWebBlob(body) {
  return typeof body === "object" && body !== null && typeof /** @type {{ arrayBuffer?: unknown }} */ (body).arrayBuffer === "function";
}

/**
 * @param {Uint8Array | import('stream').Readable | WebReadable | WebBlob} streamBody
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(streamBody) {
  if (streamBody instanceof Uint8Array) {
    return Buffer.from(streamBody);
  }

  if (isWebReadable(streamBody)) {
    const reader = streamBody.getReader();
    /** @type {Buffer[]} */
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks);
  }

  if (isWebBlob(streamBody)) {
    const arrayBuffer = await streamBody.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    const nodeStream = /** @type {import('stream').Readable} */ (streamBody);
    nodeStream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    nodeStream.on("end", () => resolve(Buffer.concat(chunks)));
    nodeStream.on("error", reject);
  });
}

/**
 * @type {import('aws-lambda').S3Handler}
 */
export const save_metadata = async (event) => {
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);
    const size = record.s3.object.size;
    const uploadedAt = record.eventTime;
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

    console.log('File Uploaded: ', key)

    const contentType = head.ContentType;
    const customMeta = head.Metadata; 

    console.log('Updating Metadata Table: ', {
        imageId: key,
        bucket,
        size,
        contentType,
        uploadedAt,
        status: 'PENDING',
        ...customMeta,
      }
)

    await ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        imageId: key,
        bucket,
        size,
        contentType,
        uploadedAt,
        status: 'PENDING',
        ...customMeta,
      }
    }));

    console.log('Metadata Updated Successfully')
    console.log('Adding message to queue')

    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify({ bucket, key }),
    }));

    console.log("Message added to queue")
}

/**
 * @type {import('aws-lambda').SQSHandler}
 */
export const process_image = async (event) => {
  /**
   * @type {import("aws-lambda").SQSBatchItemFailure[]}
   */
  const batchItemFailures = []
  assert(process.env.THUMBNAIL_BUCKET !== undefined, "No thumbnail bucket available")
  /** @type{string} */
  const thumbnail_bucket = process.env.THUMBNAIL_BUCKET

  await Promise.all(event.Records.map(async (record) => {
    try {
      const messageBody = JSON.parse(record.body);
      const bucket = messageBody.bucket;
      const key = messageBody.key;

      console.log("Processing Image:", bucket, key);

      const getObjectResponse = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      assert(getObjectResponse.Body !== undefined, "S3 object body is missing");

      const fileBuffer = await streamToBuffer(getObjectResponse.Body);

      console.log("Downloaded blob size:", fileBuffer.length);

      const res = await sharp(fileBuffer)
        .resize(200)
        .jpeg({ mozjpeg: true })
        .toBuffer()

      console.log("Resize Complete")

      await s3.send(new PutObjectCommand({
        Bucket: thumbnail_bucket,
        Key: key,
        Body: res,
        ContentType: "image/jpeg"
      }))

      console.log("Upload to thumbnail bucket complete")

      await ddb.send(new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
          imageId: key,
        },
        UpdateExpression: "SET #status = :complete",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":complete": "COMPLETE",
        },
      }));

      console.log("Update status complete")
      
    } catch (err) {
      console.error("process_image error:", err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }))

  return { batchItemFailures }

}