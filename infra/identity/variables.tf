variable "environment_name" {
  description = "Environment slug used in display names"
  type        = string
  default     = "prod"
}

variable "github_organization" {
  description = "GitHub organization (owner)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name"
  type        = string
}

variable "github_environment_name" {
  description = "GitHub environment name allowed for production deploy federation"
  type        = string
  default     = "production"
}

variable "federated_audience" {
  description = "OIDC audience for GitHub Actions federation"
  type        = string
  default     = "api://AzureADTokenExchange"
}

variable "api_identifier_uri" {
  description = "API audience URI used in token validation"
  type        = string
  default     = "api://compass-api"

  validation {
    condition     = can(regex("^api://[A-Za-z0-9][A-Za-z0-9._:/-]*$", var.api_identifier_uri))
    error_message = "api_identifier_uri must start with 'api://' and contain only URI-safe path characters."
  }
}

variable "required_scope_name" {
  description = "Delegated scope value for API"
  type        = string
  default     = "platform.read"
}

variable "timesync_admin_role_id" {
  description = "Stable UUID for TimeSync.Admin role"
  type        = string
  default     = "a2d22aa8-f4e4-4e63-8c0f-1c32f1fdb7bc"
}

variable "owners" {
  description = "Optional owners for created app registrations"
  type        = list(string)
  default     = []
}

variable "web_redirect_uris" {
  description = "Redirect URIs for interactive web app registration"
  type        = list(string)
  default     = []
}
