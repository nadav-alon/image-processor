locals {
  table_name            = "ImageMetadata_${var.environment}"
  image_bucket_name     = "images-${var.environment}-${random_id.bucket_suffix.hex}"
  thumbnail_bucket_name = "thumbnails-${var.environment}-${random_id.bucket_suffix.hex}"
  process_queue_name    = "unprocessed_images"
  process_dlq_name      = "process_dlq"
  metadata_lambda_name  = "metadata_lambda"
  process_lambda_name   = "process_lambda"
}