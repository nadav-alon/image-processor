import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { save_metadata, process_image } from "./index.js";

// Valid 1x1 JPEG to satisfy sharp resizing logic
const valid1x1Jpeg = Buffer.from(
  "ffd8ffdb00430006040506050406060506070706080a100a0a09090a140e0f0c1017141818171416161a1d251f1a1b231c1616202c20232627292a29191f2d302d283025282928ffdb0043010707070a080a130a0a13281a161a2828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828ffc00011080002000203012200021101031101ffc4001500010100000000000000000000000000000007ffc40014100100000000000000000000000000000000ffc4001501010100000000000000000000000000000608ffc40014110100000000000000000000000000000000ffda000c03010002110311003f009d001ca45fffd9",
  "hex"
);

test("save_metadata lambda", async (t) => {
  // Captured payloads
  let ddbPutPayload = null;
  let sqsSentPayload = null;
  let s3HeadPayload = null;

  // Setup environment
  process.env.TABLE_NAME = "TestTable";
  process.env.QUEUE_URL = "http://localhost:4566/000000000000/test-queue";

  // Mock S3
  mock.method(S3Client.prototype, "send", async (command) => {
    if (command.constructor.name === "HeadObjectCommand") {
      s3HeadPayload = command.input;
      return {
        ContentType: "image/jpeg",
        Metadata: { owner: "dev" },
      };
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
  });

  // Mock DynamoDB
  mock.method(DynamoDBClient.prototype, "send", async (command) => {
    if (command.constructor.name === "PutCommand" || command.constructor.name === "PutItemCommand") {
      ddbPutPayload = command.input;
      return {};
    }
    throw new Error(`Unexpected DynamoDB command: ${command.constructor.name}`);
  });

  // Mock SQS
  mock.method(SQSClient.prototype, "send", async (command) => {
    if (command.constructor.name === "SendMessageCommand") {
      sqsSentPayload = command.input;
      return { MessageId: "msg-1234" };
    }
    throw new Error(`Unexpected SQS command: ${command.constructor.name}`);
  });

  // Tear down mocks after this test
  t.after(() => {
    mock.restoreAll();
  });

  // Mock S3 Event Trigger payload
  const s3Event = {
    Records: [
      {
        eventTime: "2026-05-18T17:40:00.000Z",
        s3: {
          bucket: { name: "test-images-bucket" },
          object: { key: "vacation/photo1.jpg", size: 102400 },
        },
      },
    ],
  };

  // Run handler
  await save_metadata(s3Event);

  // Assertions
  assert.deepStrictEqual(s3HeadPayload, {
    Bucket: "test-images-bucket",
    Key: "vacation/photo1.jpg",
  });

  assert.ok(ddbPutPayload);
  assert.strictEqual(ddbPutPayload.TableName, "TestTable");
  assert.deepStrictEqual(ddbPutPayload.Item, {
    imageId: "vacation/photo1.jpg",
    bucket: "test-images-bucket",
    size: 102400,
    contentType: "image/jpeg",
    uploadedAt: "2026-05-18T17:40:00.000Z",
    status: "PENDING",
    owner: "dev",
  });

  assert.ok(sqsSentPayload);
  assert.strictEqual(sqsSentPayload.QueueUrl, process.env.QUEUE_URL);
  assert.deepStrictEqual(JSON.parse(sqsSentPayload.MessageBody), {
    bucket: "test-images-bucket",
    key: "vacation/photo1.jpg",
  });
});

test("process_image lambda - success flow", async (t) => {
  let s3GetPayload = null;
  let s3PutPayload = null;
  let ddbUpdatePayload = null;

  // Setup environment
  process.env.TABLE_NAME = "TestTable";
  process.env.THUMBNAIL_BUCKET = "test-thumbnails-bucket";

  // Mock S3
  mock.method(S3Client.prototype, "send", async (command) => {
    if (command.constructor.name === "GetObjectCommand") {
      s3GetPayload = command.input;
      return { Body: valid1x1Jpeg };
    }
    if (command.constructor.name === "PutObjectCommand") {
      s3PutPayload = command.input;
      return { ETag: '"some-etag"' };
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
  });

  // Mock DynamoDB
  mock.method(DynamoDBClient.prototype, "send", async (command) => {
    if (command.constructor.name === "UpdateCommand" || command.constructor.name === "UpdateItemCommand") {
      ddbUpdatePayload = command.input;
      return {};
    }
    throw new Error(`Unexpected DynamoDB command: ${command.constructor.name}`);
  });

  t.after(() => {
    mock.restoreAll();
  });

  // Mock SQS Event Trigger payload
  const sqsEvent = {
    Records: [
      {
        messageId: "msg-uuid-1",
        body: JSON.stringify({
          bucket: "test-images-bucket",
          key: "vacation/photo1.jpg",
        }),
      },
    ],
  };

  // Run handler
  const result = await process_image(sqsEvent);

  // Assertions
  assert.deepStrictEqual(result, { batchItemFailures: [] });

  assert.deepStrictEqual(s3GetPayload, {
    Bucket: "test-images-bucket",
    Key: "vacation/photo1.jpg",
  });

  assert.ok(s3PutPayload);
  assert.strictEqual(s3PutPayload.Bucket, "test-thumbnails-bucket");
  assert.strictEqual(s3PutPayload.Key, "vacation/photo1.jpg");
  assert.strictEqual(s3PutPayload.ContentType, "image/jpeg");
  assert.ok(Buffer.isBuffer(s3PutPayload.Body)); // Sharp resized buffer

  assert.ok(ddbUpdatePayload);
  assert.strictEqual(ddbUpdatePayload.TableName, "TestTable");
  assert.deepStrictEqual(ddbUpdatePayload.Key, { imageId: "vacation/photo1.jpg" });
  assert.strictEqual(ddbUpdatePayload.UpdateExpression, "SET #status = :complete");
});

test("process_image lambda - error retry propagation flow", async (t) => {
  // Suppress console.error in tests to avoid confusing stack traces for expected errors
  mock.method(console, "error", () => {});

  // Mock GetObjectCommand to fail, which triggers our handler's catch-block
  mock.method(S3Client.prototype, "send", async (command) => {
    if (command.constructor.name === "GetObjectCommand") {
      throw new Error("S3 Access Denied / Network Failure");
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
  });

  t.after(() => {
    mock.restoreAll();
  });

  const sqsEvent = {
    Records: [
      {
        messageId: "msg-corrupted-id",
        body: JSON.stringify({
          bucket: "test-images-bucket",
          key: "vacation/bad-photo.jpg",
        }),
      },
    ],
  };

  // Run handler
  const result = await process_image(sqsEvent);

  // Assertions: should report the failed message ID to SQS batchItemFailures
  assert.deepStrictEqual(result, {
    batchItemFailures: [{ itemIdentifier: "msg-corrupted-id" }],
  });
});
