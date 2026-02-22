locals {
  repo_slug = "${var.github_organization}/${var.github_repository}"
  deploy_subject = "repo:${local.repo_slug}:ref:${var.github_main_branch_ref}"
}

resource "azuread_application" "api" {
  display_name    = "compass-api-${var.environment_name}"
  identifier_uris = [var.api_identifier_uri]
  owners          = var.owners

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Read Compass employee consolidated time data"
      admin_consent_display_name = "Read Compass employee data"
      enabled                    = true
      id                         = "37c2d02e-5e58-4834-a822-b38488be7862"
      type                       = "User"
      user_consent_description   = "Read your consolidated employee data"
      user_consent_display_name  = "Read your Compass data"
      value                      = var.required_scope_name
    }
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
