data "archive_file" "image_processing" {
  type        = "zip"
  source_dir  = "${path.module}/../src"
  output_path = "${path.module}/function.zip"
}

resource "aws_lambda_function" "metadata_lambda" {
  filename         = data.archive_file.image_processing.output_path
  function_name    = local.metadata_lambda_name
  role             = aws_iam_role.metadata_lambda_role.arn
  handler          = "index.save_metadata"
  source_code_hash = data.archive_file.image_processing.output_base64sha256

  runtime = "nodejs24.x"

  environment {
    variables = {
      TABLE_NAME       = local.table_name
      QUEUE_URL        = aws_sqs_queue.process_queue.url
      AWS_ENDPOINT_URL = var.is_localstack ? "http://localhost.localstack.cloud:4566" : ""
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
  role             = aws_iam_role.process_lambda_role.arn
  handler          = "index.process_image"
  source_code_hash = data.archive_file.image_processing.output_base64sha256

  runtime = "nodejs24.x"
  timeout = 60

  environment {
    variables = {
      TABLE_NAME       = local.table_name
      QUEUE_URL        = aws_sqs_queue.process_queue.url
      AWS_ENDPOINT_URL = var.is_localstack ? "http://localhost.localstack.cloud:4566" : ""
      THUMBNAIL_BUCKET = aws_s3_bucket.thumbnail_bucket.bucket
    }
  }
}

resource "aws_lambda_event_source_mapping" "process_lambda_sqs_trigger" {
  event_source_arn = aws_sqs_queue.process_queue.arn
  function_name    = aws_lambda_function.process_lambda.arn
  batch_size       = 5

  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 100
  }
}
