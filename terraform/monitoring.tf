
resource "aws_sns_topic" "alerts_topic" {
  name = "system_alerts"
}

resource "aws_sns_topic_subscription" "alerts_http_subscription" {
  topic_arn = aws_sns_topic.alerts_topic.arn
  protocol  = var.is_localstack ? "http" : "https"
  endpoint  = var.is_localstack ? "http://localhost:8080/alerts" : var.alert_endpoint
}

resource "aws_cloudwatch_metric_alarm" "sqs_unprocessed_backlog_alarm" {
  alarm_name          = "sqs_unprocessed_backlog_alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 5
  alarm_description   = "This alarm monitors SQS backlog. Triggers if messages pile up unprocessed."
  alarm_actions       = [aws_sns_topic.alerts_topic.arn]

  dimensions = {
    QueueName = aws_sqs_queue.process_queue.name
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_alarm" {
  alarm_name          = "sqs_dlq_message_alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Critical! Triggered immediately if processing fails and a message lands in the DLQ."
  alarm_actions       = [aws_sns_topic.alerts_topic.arn]

  dimensions = {
    QueueName = aws_sqs_queue.process_dlq.name
  }
}

resource "aws_cloudwatch_metric_alarm" "process_lambda_error_alarm" {
  alarm_name          = "process_lambda_errors_alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Monitors runtime execution errors in the image processing Lambda function."
  alarm_actions       = [aws_sns_topic.alerts_topic.arn]

  dimensions = {
    FunctionName = aws_lambda_function.process_lambda.function_name
  }
}

resource "aws_cloudwatch_log_group" "metadata_log_group" {
  name              = "/aws/lambda/${local.metadata_lambda_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "process_log_group" {
  name              = "/aws/lambda/${local.process_lambda_name}"
  retention_in_days = 14
}