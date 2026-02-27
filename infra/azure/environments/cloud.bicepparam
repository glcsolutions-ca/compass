using '../main.bicep'

// Single cloud environment parameter contract.
// Non-secrets stay in this file (repo-tracked); secrets come from Key Vault.

param location = 'canadacentral'

param vnetName = 'vnet-compass-prod-canadacentral-02'
param acaSubnetName = 'snet-compass-aca-prod-canadacentral-02'
param postgresSubnetName = 'snet-compass-psql-prod-canadacentral-02'
param vnetAddressPrefix = '10.42.0.0/16'
param acaSubnetPrefix = '10.42.0.0/23'
param postgresSubnetPrefix = '10.42.2.0/24'
param privateDnsZoneName = 'compass-prod-canadacentral-02.postgres.database.azure.com'

param environmentName = 'cae-compass-prod-canadacentral-02'
param logAnalyticsWorkspaceName = 'log-compass-prod-canadacentral-02'
param apiAppName = 'ca-compass-api-prd-cc-02'
param webAppName = 'ca-compass-web-prd-cc-02'
param workerAppName = 'ca-compass-worker-prd-cc-02'
param workerRuntimeIdentityName = 'id-compass-worker-runtime-prd-cc-02'
param dynamicSessionsPoolName = 'dspoolcompassprdcc02'
param dynamicSessionsExecutorIdentityName = 'id-compass-session-executor-prd-cc-02'
param migrationJobName = 'caj-compass-migrate-prd-cc-02'
param acrPullIdentityName = 'id-compass-acrpull-prd-cc-02'
param acrName = 'acrcompassprodcc024514'
param acrSku = 'Basic'
param keyVaultName = 'kv-compass-prd-cc-024514'
param keyVaultUri = 'https://kv-compass-prd-cc-024514.vault.azure.net/'

param postgresServerName = 'psql-compass-prod-canadacentral-02-4514'
param postgresDatabaseName = 'compass'
param postgresAdminUsername = 'compassadmin'
param postgresAdminPassword = az.getSecret(
  readEnvironmentVariable('AZURE_SUBSCRIPTION_ID', '4514a0d0-2cdc-468e-be25-895aef2846ad'),
  readEnvironmentVariable('AZURE_RESOURCE_GROUP', 'rg-compass-prod-canadacentral-02'),
  keyVaultName,
  'postgres-admin-password'
)
param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresVersion = '16'
param postgresStorageMb = 32768

param apiImage = 'acrcompassprodcc024514.azurecr.io/compass-api:bootstrap'
param webImage = 'acrcompassprodcc024514.azurecr.io/compass-web:bootstrap'
param workerImage = 'acrcompassprodcc024514.azurecr.io/compass-worker:bootstrap'
param dynamicSessionsRuntimeImage = 'acrcompassprodcc024514.azurecr.io/compass-codex-session-runtime:bootstrap'
param authMode = 'entra'
param entraClientId = '0f3ba6d0-5415-441a-b8af-357699d364d1'
param entraAllowedTenantIds = '98dddcec-5421-457b-8cac-aa8d27fbafb6,ee852daf-7ab7-4779-aae4-3b50eba7b266'

param serviceBusProdNamespaceName = 'sb-compass-prod-cc-4514-02'
param serviceBusQueueName = 'compass-events'
param workerRunMode = 'loop'

param apiCustomDomain = 'api.compass.glcsolutions.ca'
param webCustomDomain = 'compass.glcsolutions.ca'

param apiLogLevel = 'warn'
param authIssuer = 'https://login.microsoftonline.com/98dddcec-5421-457b-8cac-aa8d27fbafb6/v2.0'
param authJwksUri = 'https://login.microsoftonline.com/98dddcec-5421-457b-8cac-aa8d27fbafb6/discovery/v2.0/keys'
param authAudience = '9b6bfc26-3325-4f10-960f-7369b9acc637'
param authAllowedClientIds = '0f3ba6d0-5415-441a-b8af-357699d364d1,14908aa3-f438-4d16-a770-4accfd74948b,a8e37df5-2ac0-47eb-b470-b3738f618125,04b07795-8ddb-461a-bbee-02f9e1bf7b46'
param authActiveTenantIds = '98dddcec-5421-457b-8cac-aa8d27fbafb6,ee852daf-7ab7-4779-aae4-3b50eba7b266'
param oauthTokenIssuer = 'https://api.compass.glcsolutions.ca/oauth'
param oauthTokenAudience = 'compass-scim'

param authBootstrapAllowedTenantId = '98dddcec-5421-457b-8cac-aa8d27fbafb6'
param authBootstrapAllowedAppClientId = '14908aa3-f438-4d16-a770-4accfd74948b'
param authBootstrapDelegatedUserOid = 'ae477ca6-8be7-4751-b310-99d4c474c78d'
param authBootstrapDelegatedUserEmail = 'jkropp@glcsolutions.ca'

param migrationLockTimeout = '5s'
param migrationStatementTimeout = '15min'
param dynamicSessionsCodexApiKeySecretName = 'openai-api-key'
param dynamicSessionsCodexApiKey = az.getSecret(
  readEnvironmentVariable('AZURE_SUBSCRIPTION_ID', '4514a0d0-2cdc-468e-be25-895aef2846ad'),
  readEnvironmentVariable('AZURE_RESOURCE_GROUP', 'rg-compass-prod-canadacentral-02'),
  keyVaultName,
  dynamicSessionsCodexApiKeySecretName
)
param dynamicSessionsRuntimeEngine = 'codex'
param dynamicSessionsCodexAppServerCommand = 'codex'
param dynamicSessionsCodexAppServerArgs = 'app-server'
param dynamicSessionsCodexTurnTimeoutMs = 120000
param agentGatewayEnabled = false
param agentCloudModeEnabled = false
param agentLocalModeEnabledDesktop = false
param agentModeSwitchEnabled = false
