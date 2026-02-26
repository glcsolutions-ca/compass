environment_name    = "prod"
github_organization = "SET_IN_GITHUB_ENV"
github_repository   = "SET_IN_GITHUB_ENV"

api_identifier_uri  = "SET_IN_GITHUB_ENV"
required_scope_name = "compass.user"

# Populate these with actual IDs to establish explicit ownership for created app registrations.
owners = []

web_redirect_uris = [
  "http://localhost:3000/v1/auth/entra/callback",
  "http://127.0.0.1:3000/v1/auth/entra/callback"
]
