variable "is_localstack" {
  type = bool
  default = true
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "dev"
}

variable "alert_endpoint" {
  type        = string
  description = "SNS subscription endpoint for live AWS environment"
  default     = "https://api.example.com/alerts"
}