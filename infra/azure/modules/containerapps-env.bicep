param location string
param environmentName string
param infrastructureSubnetId string
param logAnalyticsWorkspaceName string
param apiCustomDomain string = ''
param webCustomDomain string = ''
param codexCustomDomain string = ''
param apiManagedCertificateName string = ''
param webManagedCertificateName string = ''
param codexManagedCertificateName string = ''
param customDomainValidationMethod string = 'CNAME'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: listKeys(workspace.id, workspace.apiVersion).primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
  }
}

resource apiManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(apiCustomDomain)) {
  parent: managedEnvironment
  name: apiManagedCertificateName
  location: location
  properties: {
    subjectName: apiCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
}

resource webManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(webCustomDomain)) {
  parent: managedEnvironment
  name: webManagedCertificateName
  location: location
  properties: {
    subjectName: webCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
}

resource codexManagedCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(codexCustomDomain)) {
  parent: managedEnvironment
  name: codexManagedCertificateName
  location: location
  properties: {
    subjectName: codexCustomDomain
    domainControlValidation: customDomainValidationMethod
  }
}

output environmentId string = managedEnvironment.id
output environmentNameOutput string = managedEnvironment.name
output defaultDomain string = managedEnvironment.properties.defaultDomain
output apiManagedCertificateId string = empty(apiCustomDomain) ? '' : apiManagedCertificate.id
output webManagedCertificateId string = empty(webCustomDomain) ? '' : webManagedCertificate.id
output codexManagedCertificateId string = empty(codexCustomDomain) ? '' : codexManagedCertificate.id
