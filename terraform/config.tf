resource "local_file" "frontend_config" {
  filename = "${path.module}/../config.js"
  content  = <<-EOT
    window.AETHER_CONFIG = {
      S3_ORIGINAL: "${var.is_localstack ? "http://localhost:4566/${local.image_bucket_name}" : "https://${local.image_bucket_name}.s3.amazonaws.com"}",
      S3_THUMBNAIL: "${var.is_localstack ? "http://localhost:4566/${local.thumbnail_bucket_name}" : "https://${local.thumbnail_bucket_name}.s3.amazonaws.com"}"
    };
  EOT
}
