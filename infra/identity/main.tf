locals {
  repo_slug      = "${var.github_organization}/${var.github_repository}"
  deploy_subject = "repo:${local.repo_slug}:environment:${var.github_environment_name}"
  normalized_web_custom_domains = distinct([
    for domain in concat(var.web_custom_domains, [var.web_custom_domain]) :
    lower(trimsuffix(trimprefix(trimprefix(trimspace(domain), "https://"), "http://"), "/"))
    if trimspace(domain) != ""
  ])
  web_containerapp_fqdn       = trimsuffix(trimprefix(trimprefix(trimspace(var.web_containerapp_fqdn), "https://"), "http://"), "/")
  web_containerapp_fqdn_parts = local.web_containerapp_fqdn != "" ? split(".", local.web_containerapp_fqdn) : []
  web_containerapp_app_name   = length(local.web_containerapp_fqdn_parts) > 0 ? local.web_containerapp_fqdn_parts[0] : ""
  web_containerapp_domain_suffix = length(local.web_containerapp_fqdn_parts) > 1 ? join(
    ".",
    slice(local.web_containerapp_fqdn_parts, 1, length(local.web_containerapp_fqdn_parts))
  ) : ""
  web_redirect_uris_from_domains = [
    for domain in local.normalized_web_custom_domains : "https://${domain}/v1/auth/entra/callback"
  ]
  slot_redirect_uris = local.web_containerapp_app_name != "" && local.web_containerapp_domain_suffix != "" ? [
    for label in var.release_slot_labels : "https://${local.web_containerapp_app_name}---${lower(trimspace(label))}.${local.web_containerapp_domain_suffix}/v1/auth/entra/callback"
    if trimspace(label) != ""
  ] : []
  web_redirect_uris = distinct(
    concat(var.web_redirect_uris, local.web_redirect_uris_from_domains, local.slot_redirect_uris)
  )
  # Scratch-drill trigger marker: intentionally non-functional.
  # Final-proof scratch-drill marker: intentionally non-functional.
  # Post-infra-fix scratch-drill marker: intentionally non-functional.
  # Post-cert-order-fix final-proof marker: intentionally non-functional.
}

resource "azuread_application" "api" {
  display_name     = "compass-api-${var.environment_name}"
  identifier_uris  = [var.api_identifier_uri]
  owners           = var.owners
  sign_in_audience = "AzureADMultipleOrgs"

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Read Compass platform data"
      admin_consent_display_name = "Read Compass platform data"
      enabled                    = true
      id                         = var.user_scope_id
      type                       = "User"
      user_consent_description   = "Read your Compass platform data"
      user_consent_display_name  = "Read your Compass data"
      value                      = var.required_scope_name
    }

    oauth2_permission_scope {
      admin_consent_description  = "Administer Compass platform data"
      admin_consent_display_name = "Administer Compass platform data"
      enabled                    = true
      id                         = var.admin_scope_id
      type                       = "User"
      user_consent_description   = "Administer Compass platform data on your behalf"
      user_consent_display_name  = "Administer Compass platform data"
      value                      = var.admin_scope_name
    }
  }

  app_role {
    allowed_member_types = ["Application", "User"]
    description          = "Read-only integration access for Compass platform APIs"
    display_name         = "Compass.Integration.Read"
    enabled              = true
    id                   = var.integration_read_role_id
    value                = "Compass.Integration.Read"
  }

  app_role {
    allowed_member_types = ["Application", "User"]
    description          = "Read/write integration access for Compass platform APIs"
    display_name         = "Compass.Integration.Write"
    enabled              = true
    id                   = var.integration_write_role_id
    value                = "Compass.Integration.Write"
  }

  app_role {
    allowed_member_types = ["Application", "User"]
    description          = "Administrative role for cross-employee time synchronization access"
    display_name         = "TimeSync.Admin"
    enabled              = true
    id                   = var.timesync_admin_role_id
    value                = "TimeSync.Admin"
  }
}

resource "azuread_service_principal" "api" {
  client_id = azuread_application.api.client_id
  owners    = var.owners
}

resource "azuread_application" "web" {
  display_name     = "compass-web-${var.environment_name}"
  owners           = var.owners
  sign_in_audience = "AzureADMultipleOrgs"

  web {
    redirect_uris = local.web_redirect_uris
    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = false
    }
  }

  required_resource_access {
    resource_app_id = azuread_application.api.client_id

    resource_access {
      id   = azuread_application.api.oauth2_permission_scope_ids[var.required_scope_name]
      type = "Scope"
    }
  }
}

resource "azuread_service_principal" "web" {
  client_id = azuread_application.web.client_id
  owners    = var.owners
}

resource "azuread_application" "deploy" {
  display_name = "compass-deploy-${var.environment_name}"
  owners       = var.owners
}

resource "azuread_service_principal" "deploy" {
  client_id = azuread_application.deploy.client_id
  owners    = var.owners
}

resource "azuread_application" "smoke" {
  display_name = "compass-smoke-${var.environment_name}"
  owners       = var.owners

  required_resource_access {
    resource_app_id = azuread_application.api.client_id

    resource_access {
      id   = var.integration_read_role_id
      type = "Role"
    }

    resource_access {
      id   = var.timesync_admin_role_id
      type = "Role"
    }
  }
}

resource "azuread_service_principal" "smoke" {
  client_id = azuread_application.smoke.client_id
  owners    = var.owners
}

resource "azuread_application_federated_identity_credential" "deploy_main" {
  application_id = azuread_application.deploy.id
  display_name   = "github-main-deploy"
  audiences      = [var.federated_audience]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = local.deploy_subject
}

resource "azuread_application_federated_identity_credential" "smoke_main" {
  application_id = azuread_application.smoke.id
  display_name   = "github-main-smoke"
  audiences      = [var.federated_audience]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = local.deploy_subject
}

resource "azuread_app_role_assignment" "smoke_timesync_admin" {
  app_role_id         = var.timesync_admin_role_id
  principal_object_id = azuread_service_principal.smoke.object_id
  resource_object_id  = azuread_service_principal.api.object_id
}

resource "azuread_app_role_assignment" "smoke_integration_read" {
  app_role_id         = var.integration_read_role_id
  principal_object_id = azuread_service_principal.smoke.object_id
  resource_object_id  = azuread_service_principal.api.object_id
}
