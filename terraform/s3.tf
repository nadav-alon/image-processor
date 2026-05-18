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

resource "aws_s3_bucket_server_side_encryption_configuration" "images_sse" {
  bucket = aws_s3_bucket.images_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "images_public_block" {
  bucket                  = aws_s3_bucket.images_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "images_versioning" {
  bucket = aws_s3_bucket.images_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "thumbnails_sse" {
  bucket = aws_s3_bucket.thumbnail_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "thumbnails_public_block" {
  bucket                  = aws_s3_bucket.thumbnail_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "thumbnails_versioning" {
  bucket = aws_s3_bucket.thumbnail_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}