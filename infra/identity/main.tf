locals {
  repo_slug      = "${var.github_organization}/${var.github_repository}"
  deploy_subject = "repo:${local.repo_slug}:environment:${var.github_environment_name}"
  # Scratch-drill trigger marker: intentionally non-functional.
  # Final-proof scratch-drill marker: intentionally non-functional.
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
  display_name = "compass-web-${var.environment_name}"
  owners       = var.owners

  web {
    redirect_uris = var.web_redirect_uris
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
