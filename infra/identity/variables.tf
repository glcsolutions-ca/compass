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

variable "github_main_branch_ref" {
  description = "Git ref allowed for production deploy federation"
  type        = string
  default     = "refs/heads/main"
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
}

variable "required_scope_name" {
  description = "Delegated scope value for API"
  type        = string
  default     = "time.read"
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
