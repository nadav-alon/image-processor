resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "images_bucket" {
  bucket = local.image_bucket_name
}

resource "aws_s3_bucket" "thumbnail_bucket" {
  bucket = local.thumbnail_bucket_name
}

resource "aws_s3_bucket_cors_configuration" "images_cors" {
  bucket = aws_s3_bucket.images_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_cors_configuration" "thumbnails_cors" {
  bucket = aws_s3_bucket.thumbnail_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}