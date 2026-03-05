environment_name    = "prod"
github_organization = "glcsolutions-ca"
github_repository   = "compass"

api_identifier_uri  = "api://compass-api"
required_scope_name = "compass.user"

# Preserve explicit ownership on app registrations/service principals.
owners = [
  "a2d4b354-4dc9-48d3-ade1-dedb1d816085",
  "ae477ca6-8be7-4751-b310-99d4c474c78d"
]

web_redirect_uris = [
  "http://localhost:3000/v1/auth/entra/callback",
  "http://127.0.0.1:3000/v1/auth/entra/callback"
]
web_custom_domain = "compass.glcsolutions.ca"
web_custom_domains = [
  "compass.glcsolutions.ca"
]

web_containerapp_fqdn = "ca-compass-web-prd-cc-02.mangorock-f84bc8a0.canadacentral.azurecontainerapps.io"
