variable "is_localstack" {
  type = bool
  default = true
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "dev"
}