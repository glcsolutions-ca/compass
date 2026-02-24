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
  description = "Delegated scope value used by the web app required_resource_access entry"
  type        = string
  default     = "compass.user"
}

variable "admin_scope_name" {
  description = "Delegated admin scope value for API"
  type        = string
  default     = "compass.admin"
}

variable "user_scope_id" {
  description = "Stable UUID for delegated compass.user scope"
  type        = string
  default     = "37c2d02e-5e58-4834-a822-b38488be7862"
}

variable "admin_scope_id" {
  description = "Stable UUID for delegated compass.admin scope"
  type        = string
  default     = "0fd4b49e-8f47-4f3c-9f2f-f145297a67a1"
}

variable "integration_read_role_id" {
  description = "Stable UUID for Compass.Integration.Read role"
  type        = string
  default     = "8f5e637f-5ae5-4d22-8e95-135f36f97939"
}

variable "integration_write_role_id" {
  description = "Stable UUID for Compass.Integration.Write role"
  type        = string
  default     = "92ce2a48-1fdb-444c-8f1f-86240bbf2895"
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
