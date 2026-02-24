output "tenant_id" {
  value = data.azuread_client_config.current.tenant_id
}

output "entra_issuer" {
  value = "https://login.microsoftonline.com/${data.azuread_client_config.current.tenant_id}/v2.0"
}

output "entra_jwks_uri" {
  value = "https://login.microsoftonline.com/${data.azuread_client_config.current.tenant_id}/discovery/v2.0/keys"
}

output "entra_audience" {
  value = var.api_identifier_uri
}

output "api_application_client_id" {
  value = azuread_application.api.client_id
}

output "web_application_client_id" {
  value = azuread_application.web.client_id
}

output "deploy_application_client_id" {
  value = azuread_application.deploy.client_id
}

output "smoke_application_client_id" {
  value = azuread_application.smoke.client_id
}

output "timesync_admin_role_id" {
  value = var.timesync_admin_role_id
}

output "integration_read_role_id" {
  value = var.integration_read_role_id
}

output "integration_write_role_id" {
  value = var.integration_write_role_id
}
