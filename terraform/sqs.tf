resource "aws_sqs_queue" "process_queue" {
  name                      = local.process_queue_name
  delay_seconds             = 0
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
