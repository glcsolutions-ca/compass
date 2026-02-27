param location string = 'SET_IN_GITHUB_ENV'
// Scratch-drill trigger marker: intentionally non-functional.
// Final-proof scratch-drill marker: intentionally non-functional.
// Post-infra-fix scratch-drill marker: intentionally non-functional.
// Post-cert-order-fix final-proof marker: intentionally non-functional.
// Proof-A infra convergence marker (2026-02-25): intentionally non-functional.
// Custom-domain convergence marker (2026-02-25): intentionally non-functional.
// Custom-domain convergence marker C (2026-02-25): intentionally non-functional.

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
param workerAppName string = 'SET_IN_GITHUB_ENV'
param workerRuntimeIdentityName string = 'SET_IN_GITHUB_ENV'
param dynamicSessionsPoolName string = 'SET_IN_GITHUB_ENV'
param dynamicSessionsExecutorIdentityName string = 'SET_IN_GITHUB_ENV'
param migrationJobName string = 'SET_IN_GITHUB_ENV'
param acrPullIdentityName string = 'SET_IN_GITHUB_ENV'
param acrName string = 'SET_IN_GITHUB_ENV'
param keyVaultName string = 'SET_IN_GITHUB_ENV'
param keyVaultUri string = 'https://SET_IN_GITHUB_ENV.vault.azure.net/'
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
param workerImage string = 'SET_IN_GITHUB_ENV'
param dynamicSessionsRuntimeImage string = 'SET_IN_GITHUB_ENV'
param authMode string = 'entra'
param entraClientId string = ''
param entraAllowedTenantIds string = ''
param serviceBusProdNamespaceName string = 'SET_IN_GITHUB_ENV'
param serviceBusQueueName string = 'compass-events'
param workerRunMode string = 'loop'
param apiCustomDomain string = ''
param webCustomDomain string = ''

param apiLogLevel string = 'warn'
param authIssuer string = 'SET_IN_GITHUB_ENV'
param authJwksUri string = 'SET_IN_GITHUB_ENV'
param authAudience string = 'SET_IN_GITHUB_ENV'
param authAllowedClientIds string = 'SET_IN_GITHUB_ENV'
param authActiveTenantIds string = 'SET_IN_GITHUB_ENV'
param oauthTokenIssuer string = 'SET_IN_GITHUB_ENV'
param oauthTokenAudience string = 'compass-scim'
param authBootstrapAllowedTenantId string = 'SET_IN_GITHUB_ENV'
param authBootstrapAllowedAppClientId string = 'SET_IN_GITHUB_ENV'
param authBootstrapDelegatedUserOid string = 'SET_IN_GITHUB_ENV'
param authBootstrapDelegatedUserEmail string = 'SET_IN_GITHUB_ENV'
param migrationLockTimeout string = '5s'
param migrationStatementTimeout string = '15min'
param dynamicSessionsCodexApiKeySecretName string = 'openai-api-key'
@secure()
param dynamicSessionsCodexApiKey string = ''
param dynamicSessionsRuntimeEngine string = 'codex'
param dynamicSessionsCodexAppServerCommand string = 'codex'
param dynamicSessionsCodexAppServerArgs string = 'app-server'
param dynamicSessionsCodexTurnTimeoutMs int = 120000
param agentGatewayEnabled bool = false
param agentCloudModeEnabled bool = false
param agentLocalModeEnabledDesktop bool = false
param agentModeSwitchEnabled bool = false

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var serviceBusDataReceiverRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'
)
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)
var sessionExecutorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0fb8eba5-a2bb-4abe-b1c1-49dfad359bb0'
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

module serviceBusProd './modules/servicebus.bicep' = {
  name: 'servicebus-prod'
  params: {
    location: location
    namespaceName: serviceBusProdNamespaceName
    queueName: serviceBusQueueName
    disableLocalAuth: true
  }
}

var encodedDbUser = uriComponent(postgresAdminUsername)
var encodedDbPassword = uriComponent(postgresAdminPassword)
var encodedDbName = uriComponent(postgresDatabaseName)
var databaseUrl = 'postgres://${encodedDbUser}:${encodedDbPassword}@${postgres.outputs.fqdn}:5432/${encodedDbName}?sslmode=require'
var apiBaseUrl = empty(apiCustomDomain)
  ? 'https://${apiAppName}.${containerEnvironment.outputs.defaultDomain}'
  : 'https://${apiCustomDomain}'
var webBaseUrl = empty(webCustomDomain)
  ? 'https://${webAppName}.${containerEnvironment.outputs.defaultDomain}'
  : 'https://${webCustomDomain}'
resource acrPullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: acrPullIdentityName
  location: location
}

resource workerRuntimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: workerRuntimeIdentityName
  location: location
}

resource dynamicSessionsExecutorIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: dynamicSessionsExecutorIdentityName
  location: location
}

resource acrRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-12-01-preview' existing = {
  name: keyVaultName
}

resource serviceBusProdQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' existing = {
  name: '${serviceBusProdNamespaceName}/${serviceBusQueueName}'
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

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, acrPullIdentityName, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: acrPullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

resource workerQueueReceiverRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusProdQueue.id, workerRuntimeIdentityName, 'ServiceBusDataReceiver')
  scope: serviceBusProdQueue
  dependsOn: [
    serviceBusProd
  ]
  properties: {
    principalId: workerRuntimeIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: serviceBusDataReceiverRoleDefinitionId
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
    sessionExecutorIdentityResourceId: dynamicSessionsExecutorIdentity.id
    keyVaultUri: keyVaultUri
    webBaseUrl: webBaseUrl
    authMode: authMode
    entraClientId: entraClientId
    entraAllowedTenantIds: entraAllowedTenantIds
    databaseUrl: databaseUrl
    logLevel: apiLogLevel
    authIssuer: authIssuer
    authJwksUri: authJwksUri
    authAudience: authAudience
    authAllowedClientIds: authAllowedClientIds
    authActiveTenantIds: authActiveTenantIds
    oauthTokenIssuer: oauthTokenIssuer
    oauthTokenAudience: oauthTokenAudience
    customDomainName: apiCustomDomain
    dynamicSessionsPoolManagementEndpoint: dynamicSessions.outputs.poolManagementEndpoint
    dynamicSessionsExecutorClientId: dynamicSessionsExecutorIdentity.properties.clientId
    agentGatewayEnabled: agentGatewayEnabled
    agentCloudModeEnabled: agentCloudModeEnabled
    agentLocalModeEnabledDesktop: agentLocalModeEnabledDesktop
    agentModeSwitchEnabled: agentModeSwitchEnabled
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
    keyVaultSecretsUserRoleAssignment
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
    keyVaultUri: keyVaultUri
    apiBaseUrl: apiBaseUrl
    webBaseUrl: webBaseUrl
    authMode: authMode
    entraClientId: entraClientId
    entraAllowedTenantIds: entraAllowedTenantIds
    customDomainName: webCustomDomain
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
    keyVaultSecretsUserRoleAssignment
  ]
}

module worker './modules/containerapp-worker.bicep' = {
  name: 'containerapp-worker'
  params: {
    location: location
    containerAppName: workerAppName
    managedEnvironmentId: containerEnvironment.outputs.environmentId
    image: workerImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    runtimeIdentityResourceId: workerRuntimeIdentity.id
    runtimeIdentityClientId: workerRuntimeIdentity.properties.clientId
    serviceBusFullyQualifiedNamespace: serviceBusProd.outputs.namespaceFqdn
    serviceBusQueueName: serviceBusQueueName
    workerRunMode: workerRunMode
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
    workerQueueReceiverRoleAssignment
  ]
}

module dynamicSessions './modules/sessionpool-dynamic-sessions.bicep' = {
  name: 'sessionpool-dynamic-sessions'
  params: {
    location: location
    sessionPoolName: dynamicSessionsPoolName
    environmentId: containerEnvironment.outputs.environmentId
    image: dynamicSessionsRuntimeImage
    registryServer: acr.outputs.loginServer
    registryIdentityResourceId: acrPullIdentity.id
    sessionExecutorPrincipalId: dynamicSessionsExecutorIdentity.properties.principalId
    sessionExecutorRoleDefinitionId: sessionExecutorRoleDefinitionId
    runtimeEngine: dynamicSessionsRuntimeEngine
    codexAppServerCommand: dynamicSessionsCodexAppServerCommand
    codexAppServerArgs: dynamicSessionsCodexAppServerArgs
    codexTurnTimeoutMs: dynamicSessionsCodexTurnTimeoutMs
    codexApiKeySecretName: dynamicSessionsCodexApiKeySecretName
    codexApiKeySecretValue: dynamicSessionsCodexApiKey
  }
  dependsOn: [
    acrPullIdentityRoleAssignment
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
    migrationLockTimeout: migrationLockTimeout
    migrationStatementTimeout: migrationStatementTimeout
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
output webBaseUrlOutput string = webBaseUrl
output acrId string = acr.outputs.registryId
output acrNameOutput string = acr.outputs.registryNameOutput
output acrLoginServer string = acr.outputs.loginServer
output acrPullIdentityId string = acrPullIdentity.id
output acrPullIdentityPrincipalId string = acrPullIdentity.properties.principalId
output workerRuntimeIdentityId string = workerRuntimeIdentity.id
output workerRuntimeIdentityPrincipalId string = workerRuntimeIdentity.properties.principalId
output workerRuntimeIdentityClientId string = workerRuntimeIdentity.properties.clientId
output dynamicSessionsExecutorIdentityId string = dynamicSessionsExecutorIdentity.id
output dynamicSessionsExecutorIdentityName string = dynamicSessionsExecutorIdentity.name
output dynamicSessionsExecutorIdentityPrincipalId string = dynamicSessionsExecutorIdentity.properties.principalId
output serviceBusProdNamespaceNameOutput string = serviceBusProd.outputs.namespaceNameOutput
output serviceBusProdNamespaceFqdn string = serviceBusProd.outputs.namespaceFqdn
output serviceBusProdQueueId string = serviceBusProd.outputs.queueId
output serviceBusQueueNameOutput string = serviceBusQueueName

output apiContainerAppName string = api.outputs.appName
output apiLatestRevision string = api.outputs.latestRevisionName
output apiLatestRevisionFqdn string = api.outputs.latestRevisionFqdn

output webContainerAppName string = web.outputs.appName
output webLatestRevision string = web.outputs.latestRevisionName
output webLatestRevisionFqdn string = web.outputs.latestRevisionFqdn

output workerContainerAppName string = worker.outputs.appName
output workerLatestRevision string = worker.outputs.latestRevisionName

output dynamicSessionsPoolId string = dynamicSessions.outputs.sessionPoolId
output dynamicSessionsPoolNameOutput string = dynamicSessions.outputs.sessionPoolNameOutput
output dynamicSessionsPoolManagementEndpoint string = dynamicSessions.outputs.poolManagementEndpoint
output dynamicSessionsSessionExecutorRoleAssignmentId string = dynamicSessions.outputs.sessionExecutorRoleAssignmentId

output migrationJobName string = migrateJob.outputs.jobNameOutput
output migrationJobId string = migrateJob.outputs.jobId

output postgresServerResourceId string = postgres.outputs.serverId
output postgresServerName string = postgres.outputs.serverNameOutput
output postgresFqdn string = postgres.outputs.fqdn
output postgresDatabaseName string = postgres.outputs.databaseNameOutput
