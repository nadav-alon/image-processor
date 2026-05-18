#!/usr/bin/env node
// @ts-check

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, ListQueuesCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

// Colors for terminal output
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

const LOCALSTACK_URL = "http://localhost:4566";

async function main() {
  console.log(cyan("=================================================="));
  console.log(cyan("   Starting E2E LocalStack Integration Test       "));
  console.log(cyan("=================================================="));

  // 1. Verify LocalStack is active
  console.log(yellow("\n1. Verifying LocalStack connection..."));
  try {
    const response = await fetch(LOCALSTACK_URL);
    if (!response.ok && response.status !== 404) {
       throw new Error(`Status ${response.status}`);
    }
    console.log(green("✓ LocalStack is active and reachable at " + LOCALSTACK_URL));
  } catch (error) {
    console.error(red("❌ LocalStack is offline or unreachable!"));
    console.log(yellow("\nHow to resolve:"));
    console.log("Since Docker/LocalStack daemon is not running locally in this WSL distro,");
    console.log("please ensure Docker Desktop has WSL Integration enabled, and start LocalStack via:");
    console.log("  localstack start -d\n");
    process.exit(1);
  }

  // 2. Deploy infrastructure via Terraform
  console.log(yellow("\n2. Programmatically deploying infrastructure via Terraform..."));
  const terraformDir = path.resolve("./terraform");
  try {
    console.log("Running: terraform init");
    execSync("terraform init", { cwd: terraformDir, stdio: "inherit" });

    console.log("\nRunning: terraform apply -auto-approve");
    execSync("terraform apply -auto-approve", { cwd: terraformDir, stdio: "inherit" });
    console.log(green("✓ Terraform applied successfully"));
  } catch (error) {
    console.error(red("❌ Terraform deployment failed!"), error.message);
    process.exit(1);
  }

  // 3. Initialize AWS SDK Clients targetting LocalStack
  const awsConfig = {
    region: "il-central-1",
    endpoint: LOCALSTACK_URL,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    forcePathStyle: true,
  };
  const s3 = new S3Client(awsConfig);
  const sqs = new SQSClient(awsConfig);
  const ddb = new DynamoDBClient(awsConfig);

  // 4. Discover dynamically named S3 buckets
  console.log(yellow("\n3. Discovering resource names..."));
  let imagesBucket = "";
  let thumbnailsBucket = "";
  try {
    const bucketsResponse = await s3.send(new ListBucketsCommand({}));
    const buckets = bucketsResponse.Buckets || [];
    for (const b of buckets) {
      if (b.Name && b.Name.startsWith("images-dev-")) {
        imagesBucket = b.Name;
      } else if (b.Name && b.Name.startsWith("thumbnails-dev-")) {
        thumbnailsBucket = b.Name;
      }
    }

    if (!imagesBucket || !thumbnailsBucket) {
      throw new Error(`Could not locate dev buckets in S3 list: ${JSON.stringify(buckets.map(b => b.Name))}`);
    }
    console.log(green(`✓ Found Source Bucket:      ${imagesBucket}`));
    console.log(green(`✓ Found Thumbnail Bucket:   ${thumbnailsBucket}`));
  } catch (error) {
    console.error(red("❌ Failed to discover S3 buckets:"), error.message);
    process.exit(1);
  }

  // 5. Discover SQS Queue URL
  let dlqUrl = "";
  try {
    const queuesResponse = await sqs.send(new ListQueuesCommand({}));
    const queueUrls = queuesResponse.QueueUrls || [];
    for (const url of queueUrls) {
      if (url.includes("process_dlq")) {
        dlqUrl = url;
      }
    }
    if (!dlqUrl) {
      throw new Error("Could not locate process_dlq SQS Queue");
    }
    console.log(green(`✓ Found SQS DLQ Queue URL:  ${dlqUrl}`));
  } catch (error) {
    console.error(red("❌ Failed to discover SQS queue:"), error.message);
    process.exit(1);
  }

  // 6. Happy Path Test: Valid Image Upload & Resize
  console.log(cyan("\n=================================================="));
  console.log(cyan("   TEST 1: Valid Image Upload & Resize            "));
  console.log(cyan("=================================================="));

  const validKey = `e2e-test-${Date.now()}.jpg`;
  const imagePath = path.resolve("./image.jpg");
  console.log(`Reading source image from ${imagePath}...`);
  const imageBuffer = await fs.readFile(imagePath);

  console.log(`Uploading valid image to s3://${imagesBucket}/${validKey}...`);
  await s3.send(new PutObjectCommand({
    Bucket: imagesBucket,
    Key: validKey,
    Body: imageBuffer,
    ContentType: "image/jpeg",
  }));
  console.log(green("✓ Valid image uploaded."));

  console.log("Polling thumbnail bucket for resized image (timeout: 20 seconds)...");
  let thumbnailSuccess = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const getResponse = await s3.send(new GetObjectCommand({
        Bucket: thumbnailsBucket,
        Key: validKey,
      }));
      if (getResponse.Body) {
        console.log(green(`✓ SUCCESS! Thumbnail successfully generated at thumbnails-bucket/${validKey}`));
        thumbnailSuccess = true;
        break;
      }
    } catch (e) {
      process.stdout.write(".");
    }
  }
  if (!thumbnailSuccess) {
    console.error(red("\n❌ Test 1 Failed! Thumbnail was not generated within 20s."));
    process.exit(1);
  }

  // Validate DynamoDB Status is COMPLETE
  console.log("Querying DynamoDB for image status...");
  try {
    const getDbResponse = await ddb.send(new GetCommand({
      TableName: "ImageMetadata_dev",
      Key: { imageId: validKey },
    }));
    const item = getDbResponse.Item;
    console.log("DynamoDB Item:", item);
    if (item && item.status === "COMPLETE") {
      console.log(green("✓ SUCCESS! DynamoDB table status updated to COMPLETE."));
    } else {
      throw new Error(`Expected status 'COMPLETE', got: '${item?.status}'`);
    }
  } catch (error) {
    console.error(red("❌ Test 1 Failed! DynamoDB status validation failed:"), error.message);
    process.exit(1);
  }

  // 7. Error Path Test: Corrupt / Bad File Upload & SQS DLQ Routing
  console.log(cyan("\n=================================================="));
  console.log(cyan("   TEST 2: Corrupt File Upload & SQS DLQ Routing  "));
  console.log(cyan("=================================================="));

  const corruptKey = `e2e-bad-test-${Date.now()}.jpg`;
  const corruptBuffer = Buffer.from("THIS_IS_CORRUPT_NOT_A_JPEG");

  console.log(`Uploading corrupt file to s3://${imagesBucket}/${corruptKey}...`);
  await s3.send(new PutObjectCommand({
    Bucket: imagesBucket,
    Key: corruptKey,
    Body: corruptBuffer,
    ContentType: "image/jpeg",
  }));
  console.log(green("✓ Corrupt file uploaded."));

  console.log("Polling SQS Dead Letter Queue (DLQ) for message routing (timeout: 45 seconds)...");
  let dlqSuccess = false;
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const receiveResponse = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 1,
      }));
      const messages = receiveResponse.Messages || [];
      if (messages.length > 0) {
        const body = JSON.parse(messages[0].Body || "{}");
        console.log("\nReceived message from DLQ SQS Queue:", body);
        if (body.key === corruptKey) {
          console.log(green(`\n✓ SUCCESS! Corrupt image message successfully routed to DLQ after failing Lambda processing!`));
          dlqSuccess = true;
          break;
        }
      } else {
        process.stdout.write(".");
      }
    } catch (e) {
      process.stdout.write(".");
    }
  }

  if (!dlqSuccess) {
    console.error(red("\n❌ Test 2 Failed! Message was not dead-lettered within 45s."));
    process.exit(1);
  }

  console.log(cyan("\n=================================================="));
  console.log(green("   ALL INTEGRATION TESTS PASSED SUCCESSFULLY!     "));
  console.log(cyan("=================================================="));
}

main().catch(err => {
  console.error(red("Unexpected failure in E2E integration test:"), err);
  process.exit(1);
});
