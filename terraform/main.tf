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
  }
}


locals {
  table_name = "ImageMetadata_Dev"
  image_bucket_name = "images"
  thumbnail_bucket_name = "thumbnails"
  process_queue_name = "unprocessed_images"
  process_dlq_name = "process_dlq"
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