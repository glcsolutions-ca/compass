using '../main.bicep'

// This file must stay organization-neutral.
// Concrete production values are injected by GitHub environment variables/secrets at workflow runtime.

param location = 'SET_IN_GITHUB_ENV'

param vnetName = 'SET_IN_GITHUB_ENV'
param acaSubnetName = 'SET_IN_GITHUB_ENV'
param postgresSubnetName = 'SET_IN_GITHUB_ENV'
param privateDnsZoneName = 'SET_IN_GITHUB_ENV'

param environmentName = 'SET_IN_GITHUB_ENV'
param apiAppName = 'SET_IN_GITHUB_ENV'
param webAppName = 'SET_IN_GITHUB_ENV'
param migrationJobName = 'SET_IN_GITHUB_ENV'
param acrPullIdentityName = 'SET_IN_GITHUB_ENV'
param logAnalyticsWorkspaceName = 'SET_IN_GITHUB_ENV'
param acrName = 'SET_IN_GITHUB_ENV'
param acrSku = 'Standard'

param postgresServerName = 'SET_IN_GITHUB_ENV'
param postgresDatabaseName = 'SET_IN_GITHUB_ENV'
param postgresAdminUsername = 'SET_IN_GITHUB_ENV'
param postgresVersion = '16'
param postgresSkuName = 'Standard_D2s_v3'
param postgresStorageMb = 32768

param postgresAdminPassword = 'SET_IN_GITHUB_ENV'

param webBearerToken = ''

param apiImage = 'SET_IN_GITHUB_ENV'
param webImage = 'SET_IN_GITHUB_ENV'
param migrateImage = 'SET_IN_GITHUB_ENV'

param authMode = 'entra'
param requiredScope = 'time.read'
param entraIssuer = 'SET_IN_GITHUB_ENV'
param entraAudience = 'SET_IN_GITHUB_ENV'
param entraJwksUri = 'SET_IN_GITHUB_ENV'
