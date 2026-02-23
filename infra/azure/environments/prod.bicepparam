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
param acrSku = 'Basic'

param postgresServerName = 'SET_IN_GITHUB_ENV'
param postgresDatabaseName = 'SET_IN_GITHUB_ENV'
param postgresAdminUsername = 'SET_IN_GITHUB_ENV'
param postgresVersion = '16'
param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresStorageMb = 32768

param postgresAdminPassword = 'SET_IN_GITHUB_ENV'

param apiImage = 'SET_IN_GITHUB_ENV'
param webImage = 'SET_IN_GITHUB_ENV'
param apiCustomDomain = ''
param webCustomDomain = ''
param apiManagedCertificateName = ''
param webManagedCertificateName = ''
param customDomainValidationMethod = 'CNAME'
