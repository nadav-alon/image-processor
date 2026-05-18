locals {
  table_name            = "ImageMetadata_Dev"
  image_bucket_name     = "images"
  thumbnail_bucket_name = "thumbnails"
  process_queue_name    = "unprocessed_images"
  process_dlq_name      = "process_dlq"
  metadata_lambda_name  = "metadata_lambda"
  process_lambda_name   = "process_lambda"
}