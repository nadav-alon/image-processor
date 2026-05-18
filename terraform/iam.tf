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

resource "aws_iam_role" "metadata_lambda_role" {
  name               = "metadata_lambda_role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role" "process_lambda_role" {
  name               = "process_lambda_role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

data "aws_iam_policy_document" "metadata_lambda_policy" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.images_bucket.arn,
      "${aws_s3_bucket.images_bucket.arn}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
    ]
    resources = [
      aws_dynamodb_table.image_metadata_table.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:SendMessage",
    ]
    resources = [
      aws_sqs_queue.process_queue.arn,
    ]
  }
}

resource "aws_iam_role_policy" "metadata_lambda_inline_policy" {
  name   = "metadata_lambda_policy"
  role   = aws_iam_role.metadata_lambda_role.id
  policy = data.aws_iam_policy_document.metadata_lambda_policy.json
}

resource "aws_iam_role_policy_attachment" "metadata_lambda_logs" {
  role       = aws_iam_role.metadata_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "process_lambda_policy" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.images_bucket.arn,
      "${aws_s3_bucket.images_bucket.arn}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = [
      aws_s3_bucket.thumbnail_bucket.arn,
      "${aws_s3_bucket.thumbnail_bucket.arn}/*",
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:UpdateItem",
    ]
    resources = [
      aws_dynamodb_table.image_metadata_table.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [
      aws_sqs_queue.process_queue.arn,
    ]
  }
}

resource "aws_iam_role_policy" "process_lambda_inline_policy" {
  name   = "process_lambda_policy"
  role   = aws_iam_role.process_lambda_role.id
  policy = data.aws_iam_policy_document.process_lambda_policy.json
}

resource "aws_iam_role_policy_attachment" "process_lambda_logs" {
  role       = aws_iam_role.process_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}