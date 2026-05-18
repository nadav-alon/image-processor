provider "aws" {
  region                      = "il-central-1"
  access_key                  = var.is_localstack ? "test" : null
  secret_key                  = var.is_localstack ? "test" : null
  skip_credentials_validation = var.is_localstack
  skip_metadata_api_check     = var.is_localstack
  skip_requesting_account_id  = var.is_localstack
  s3_use_path_style           = var.is_localstack

  dynamic "endpoints" {
    for_each = var.is_localstack ? [1] : []
    content {
      dynamodb     = "http://localhost:4566"
      s3           = "http://localhost:4566"
      sqs          = "http://localhost:4566"
      iam          = "http://localhost:4566"
      lambda       = "http://localhost:4566"
      sts          = "http://localhost:4566"
      apigateway   = "http://localhost:4566"
      apigatewayv2 = "http://localhost:4566"
      sns            = "http://localhost:4566"
      cloudwatch     = "http://localhost:4566"
      cloudwatchlogs = "http://localhost:4566"
    }
  }
}