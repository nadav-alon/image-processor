resource "aws_dynamodb_table" "image_metadata_table" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "imageId"

  attribute {
    name = "imageId"
    type = "S"
  }
}
