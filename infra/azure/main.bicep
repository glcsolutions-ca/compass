param location string = 'SET_IN_GITHUB_ENV'
// Scratch-drill trigger marker: intentionally non-functional.
// Final-proof scratch-drill marker: intentionally non-functional.
// Post-infra-fix scratch-drill marker: intentionally non-functional.
// Post-cert-order-fix final-proof marker: intentionally non-functional.
// Proof-A infra convergence marker (2026-02-25): intentionally non-functional.

param vnetName string = 'SET_IN_GITHUB_ENV'
param acaSubnetName string = 'SET_IN_GITHUB_ENV'
param postgresSubnetName string = 'SET_IN_GITHUB_ENV'

param vnetAddressPrefix string = '10.42.0.0/16'
param acaSubnetPrefix string = '10.42.0.0/23'
param postgresSubnetPrefix string = '10.42.2.0/24'
param privateDnsZoneName string = 'SET_IN_GITHUB_ENV'

param environmentName string = 'SET_IN_GITHUB_ENV'
param logAnalyticsWorkspaceName string = 'SET_IN_GITHUB_ENV'
param apiAppName string = 'SET_IN_GITHUB_ENV'
param webAppName string = 'SET_IN_GITHUB_ENV'
param codexAppName string = 'SET_IN_GITHUB_ENV'
param migrationJobName string = 'SET_IN_GITHUB_ENV'
param acrPullIdentityName string = 'SET_IN_GITHUB_ENV'
param acrName string = 'SET_IN_GITHUB_ENV'
param acrSku string = 'Basic'

param postgresServerName string = 'SET_IN_GITHUB_ENV'
param postgresDatabaseName string = 'SET_IN_GITHUB_ENV'
param postgresAdminUsername string = 'SET_IN_GITHUB_ENV'
@secure()
param postgresAdminPassword string
param postgresSkuName string = 'Standard_B1ms'
param postgresSkuTier string = 'Burstable'
param postgresVersion string = '16'
param postgresStorageMb int = 32768

param apiImage string = 'SET_IN_GITHUB_ENV'
param webImage string = 'SET_IN_GITHUB_ENV'
param codexImage string = 'SET_IN_GITHUB_ENV'
param apiCustomDomain string = ''
param webCustomDomain string = ''
param codexCustomDomain string = ''
param apiManagedCertificateName string = ''
param webManagedCertificateName string = ''
param codexManagedCertificateName string = ''
@allowed([
  'CNAME'
  'HTTP'
  'TXT'
])
param customDomainValidationMethod string = 'CNAME'

param apiLogLevel string = 'warn'
param codexLogLevel string = 'warn'
param authIssuer string = 'SET_IN_GITHUB_ENV'
param authJwksUri string = 'SET_IN_GITHUB_ENV'
param authAudience string = 'SET_IN_GITHUB_ENV'
param authAllowedClientIds string = 'SET_IN_GITHUB_ENV'
param authActiveTenantIds string = 'SET_IN_GITHUB_ENV'
param oauthTokenIssuer string = 'SET_IN_GITHUB_ENV'
param oauthTokenAudience string = 'compass-scim'
@secure()
param oauthTokenSigningSecret string
param authBootstrapAllowedTenantId string = 'SET_IN_GITHUB_ENV'
param authBootstrapAllowedAppClientId string = 'SET_IN_GITHUB_ENV'
param authBootstrapDelegatedUserOid string = 'SET_IN_GITHUB_ENV'
param authBootstrapDelegatedUserEmail string = 'SET_IN_GITHUB_ENV'

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

module network './modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    vnetName: vnetName
    acaSubnetName: acaSubnetName
    postgresSubnetName: postgresSubnetName
    vnetAddressPrefix: vnetAddressPrefix
    acaSubnetPrefix: acaSubnetPrefix
    postgresSubnetPrefix: postgresSubnetPrefix
    privateDnsZoneName: privateDnsZoneName
  }
}

module containerEnvironment './modules/containerapps-env.bicep' = {
  name: 'containerapps-environment'
  params: {
    location: location
    environmentName: environmentName
    infrastructureSubnetId: network.outputs.acaInfrastructureSubnetId
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
  }
}

module acr './modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    registryName: acrName
    skuName: acrSku
  }
}

module postgres './modules/postgres-flex.bicep' = {
  name: 'postgres-flex'
  params: {
    location: location
    serverName: postgresServerName
    databaseName: postgresDatabaseName
    delegatedSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.privateDnsZoneId
    adminLogin: postgresAdminUsername
    adminPassword: postgresAdminPassword
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    postgresVersion: postgresVersion
    storageSizeMb: postgresStorageMb
  }
}

var encodedDbUser = uriComponent(postgresAdminUsername)
var encodedDbPassword = uriComponent(postgresAdminPassword)
var encodedDbName = uriComponent(postgresDatabaseName)
var databaseUrl = 'postgres://${encodedDbUser}:${encodedDbPassword}@${postgres.outputs.fqdn}:5432/${encodedDbName}?sslmode=require'
var apiBaseUrl = empty(apiCustomDomain)
  ? 'https://${apiAppName}.${containerEnvironment.outputs.defaultDomain}'
  : 'https://${apiCustomDomain}'
var codexBaseUrl = empty(codexCustomDomain)
  ? 'https://${codexAppName}.${containerEnvironment.outputs.defaultDomain}'
  : 'https://${codexCustomDomain}'

resource acrPullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: acrPullIdentityName
  location: location
}

resource acrRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource acrPullIdentityRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrRegistry.id, acrPullIdentityName, 'AcrPull')
  scope: acrRegistry
  dependsOn: [
    acr
  ]
  properties: {
    principalId: acrPullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

module api './modules/containerapp-api.bicep' = {
  name: 'containerapp-api'
  params: {
    location: location
    containerAppName: apiAppName
    managedEnvironmentId: containerEnvironment.outputs.environmentId
    image: apiImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    databaseUrl: databaseUrl
    logLevel: apiLogLevel
    authIssuer: authIssuer
    authJwksUri: authJwksUri
    authAudience: authAudience
    authAllowedClientIds: authAllowedClientIds
    authActiveTenantIds: authActiveTenantIds
    oauthTokenIssuer: oauthTokenIssuer
    oauthTokenAudience: oauthTokenAudience
    // Required at runtime for OAuth token issuance; keep this managed via infra convergence.
    oauthTokenSigningSecret: oauthTokenSigningSecret
    customDomainName: apiCustomDomain
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
  ]
}

module web './modules/containerapp-web.bicep' = {
  name: 'containerapp-web'
  params: {
    location: location
    containerAppName: webAppName
    managedEnvironmentId: containerEnvironment.outputs.environmentId
    image: webImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    apiBaseUrl: apiBaseUrl
    customDomainName: webCustomDomain
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
  ]
}

module codex './modules/containerapp-codex.bicep' = {
  name: 'containerapp-codex'
  params: {
    location: location
    containerAppName: codexAppName
    managedEnvironmentId: containerEnvironment.outputs.environmentId
    image: codexImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    databaseUrl: databaseUrl
    logLevel: codexLogLevel
    customDomainName: codexCustomDomain
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
  ]
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource apiManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(apiCustomDomain)) {
  parent: managedEnvironment
  name: apiManagedCertificateName
  location: location
  properties: {
    subjectName: apiCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
  dependsOn: [
    api
  ]
}

resource webManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(webCustomDomain)) {
  parent: managedEnvironment
  name: webManagedCertificateName
  location: location
  properties: {
    subjectName: webCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
  dependsOn: [
    web
  ]
}

resource codexManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(codexCustomDomain)) {
  parent: managedEnvironment
  name: codexManagedCertificateName
  location: location
  properties: {
    subjectName: codexCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
  dependsOn: [
    codex
  ]
}

module migrateJob './modules/containerapp-job-migrate.bicep' = {
  name: 'containerapp-job-migrate'
  params: {
    location: location
    jobName: migrationJobName
    managedEnvironmentId: containerEnvironment.outputs.environmentId
    image: apiImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    databaseUrl: databaseUrl
    authBootstrapAllowedTenantId: authBootstrapAllowedTenantId
    authBootstrapAllowedAppClientId: authBootstrapAllowedAppClientId
    authBootstrapDelegatedUserOid: authBootstrapDelegatedUserOid
    authBootstrapDelegatedUserEmail: authBootstrapDelegatedUserEmail
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
  ]
}

output containerAppsEnvironmentName string = containerEnvironment.outputs.environmentNameOutput
output containerAppsEnvironmentId string = containerEnvironment.outputs.environmentId
output containerAppsDefaultDomain string = containerEnvironment.outputs.defaultDomain
output apiBaseUrlOutput string = apiBaseUrl
output codexBaseUrlOutput string = codexBaseUrl
output acrId string = acr.outputs.registryId
output acrNameOutput string = acr.outputs.registryNameOutput
output acrLoginServer string = acr.outputs.loginServer
output acrPullIdentityId string = acrPullIdentity.id
output acrPullIdentityPrincipalId string = acrPullIdentity.properties.principalId

output apiContainerAppName string = api.outputs.appName
output apiLatestRevision string = api.outputs.latestRevisionName
output apiLatestRevisionFqdn string = api.outputs.latestRevisionFqdn

output webContainerAppName string = web.outputs.appName
output webLatestRevision string = web.outputs.latestRevisionName
output webLatestRevisionFqdn string = web.outputs.latestRevisionFqdn

output codexContainerAppName string = codex.outputs.appName
output codexLatestRevision string = codex.outputs.latestRevisionName
output codexLatestRevisionFqdn string = codex.outputs.latestRevisionFqdn

output migrationJobName string = migrateJob.outputs.jobNameOutput
output migrationJobId string = migrateJob.outputs.jobId

output postgresServerResourceId string = postgres.outputs.serverId
output postgresServerName string = postgres.outputs.serverNameOutput
output postgresFqdn string = postgres.outputs.fqdn
output postgresDatabaseName string = postgres.outputs.databaseNameOutput
