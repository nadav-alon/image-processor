// @ts-check

import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, ListQueuesCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb"

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
    console.log("Event recieved:", JSON.stringify(event))

}