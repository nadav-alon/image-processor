provider "aws" {
  region                      = "il-central-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    dynamodb = "http://localhost:4566"
    s3       = "http://localhost:4566"
    sqs      = "http://localhost:4566"
    iam      = "http://localhost:4566"
    lambda   = "http://localhost:4566"
    sts      = "http://localhost:4566"
  }
}


locals {
  table_name            = "ImageMetadata_Dev"
  image_bucket_name     = "images"
  thumbnail_bucket_name = "thumbnails"
  process_queue_name    = "unprocessed_images"
  process_dlq_name      = "process_dlq"
  metadata_lambda_name  = "metadata_lambda"
  process_lambda_name   = "process_lambda"
}

variable "is_localstack" {
  type = bool
  default = true
}

resource "aws_dynamodb_table" "image_metadata_table" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "imageId"

  attribute {
    name = "imageId"
    type = "S"
  }
}

resource "aws_s3_bucket" "images_bucket" {
  bucket = local.image_bucket_name
}

resource "aws_s3_bucket" "thumbnail_bucket" {
  bucket = local.thumbnail_bucket_name
}

resource "aws_sqs_queue" "process_queue" {
  name                      = local.process_queue_name
  delay_seconds             = 90
  max_message_size          = 2048
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.process_dlq.arn
    maxReceiveCount     = 4
  })
}

resource "aws_sqs_queue" "process_dlq" {
  name = local.process_dlq_name
}

resource "aws_sqs_queue_redrive_allow_policy" "terraform_queue_redrive_allow_policy" {
  queue_url = aws_sqs_queue.process_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns   = [aws_sqs_queue.process_queue.arn]
  })
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_execution_role" {
  name               = "lambda_execution_role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

data "archive_file" "image_processing" {
  type        = "zip"
  source_file = "${path.module}/../index.js"
  output_path = "${path.module}/function.zip"
}

resource "aws_lambda_function" "metadata_lambda" {
  filename         = data.archive_file.image_processing.output_path
  function_name    = local.metadata_lambda_name
  role             = aws_iam_role.lambda_execution_role.arn
  handler          = "index.save_metadata"
  source_code_hash = data.archive_file.image_processing.output_base64sha256

  runtime = "nodejs24.x"

  environment {
    variables = {
      AWS_ENDPOINT_URL = var.is_localstack ? "http://localhost.localstack.cloud:4566" : ""
      TABLE_NAME = local.table_name
    }
  }
}

resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.metadata_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.images_bucket.arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.images_bucket.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.metadata_lambda.arn
    events              = ["s3:ObjectCreated:Put"]
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

resource "aws_lambda_function" "process_lambda" {
  filename         = data.archive_file.image_processing.output_path
  function_name    = local.process_lambda_name
  role             = aws_iam_role.lambda_execution_role.arn
  handler          = "index.process_image"
  source_code_hash = data.archive_file.image_processing.output_base64sha256

  runtime = "nodejs24.x"

  environment {
    variables = {
      AWS_ENDPOINT_URL = var.is_localstack ? "http://localhost.localstack.cloud:4566" : ""
    }
  }
}