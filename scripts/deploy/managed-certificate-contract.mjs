function normalizeOptional(value) {
  return String(value ?? "").trim();
}

export function normalizeDomain(value) {
  return normalizeOptional(value).toLowerCase().replace(/\.$/, "");
}

function normalizeCertificateName(value) {
  return normalizeOptional(value);
}

function equalsIgnoreCase(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

export function extractManagedCertificateEntries(rawCertificates) {
  const certificates = Array.isArray(rawCertificates) ? rawCertificates : [];
  const entries = [];

  for (const certificate of certificates) {
    const name = normalizeCertificateName(
      certificate?.name ?? certificate?.properties?.name ?? certificate?.id?.split("/").at(-1) ?? ""
    );
    if (!name) {
      continue;
    }

    const subjectName = normalizeDomain(
      certificate?.properties?.subjectName ??
        certificate?.subjectName ??
        certificate?.properties?.subject ??
        certificate?.subject ??
        ""
    );

    entries.push({
      name,
      subjectName,
      id: normalizeOptional(certificate?.id)
    });
  }

  return entries;
}

export function evaluateManagedCertificateContract({
  scopeLabel,
  customDomain,
  customDomainEnvVar,
  managedCertificateName,
  managedCertificateEnvVar,
  managedCertificates
}) {
  const normalizedDomain = normalizeDomain(customDomain);
  const normalizedCertificateName = normalizeCertificateName(managedCertificateName);
  const certificateEntries = Array.isArray(managedCertificates) ? managedCertificates : [];

  if (!normalizedDomain) {
    if (normalizedCertificateName) {
      throw new Error(
        `[${scopeLabel}] ${managedCertificateEnvVar} must be empty when ${customDomainEnvVar} is not set`
      );
    }

    return {
      scopeLabel,
      customDomain: "",
      managedCertificateName: "",
      mode: "disabled"
    };
  }

  if (!normalizedCertificateName) {
    throw new Error(
      `[${scopeLabel}] ${managedCertificateEnvVar} is required when ${customDomainEnvVar} is set to '${normalizedDomain}'`
    );
  }

  const namedCertificate = certificateEntries.find((certificate) =>
    equalsIgnoreCase(certificate.name, normalizedCertificateName)
  );

  if (namedCertificate) {
    const namedCertificateSubject = normalizeDomain(namedCertificate.subjectName);
    if (!namedCertificateSubject) {
      throw new Error(
        `[${scopeLabel}] managed certificate '${namedCertificate.name}' has no subjectName; cannot validate it for domain '${normalizedDomain}'`
      );
    }

    if (namedCertificateSubject !== normalizedDomain) {
      throw new Error(
        [
          `[${scopeLabel}] ${managedCertificateEnvVar}='${namedCertificate.name}' does not match ${customDomainEnvVar}='${normalizedDomain}'`,
          `Existing subjectName: '${namedCertificateSubject}'`
        ].join("\n")
      );
    }

    return {
      scopeLabel,
      customDomain: normalizedDomain,
      managedCertificateName: namedCertificate.name,
      mode: "existing"
    };
  }

  const subjectMatches = certificateEntries.filter(
    (certificate) => normalizeDomain(certificate.subjectName) === normalizedDomain
  );

  if (subjectMatches.length > 0) {
    const existingNames = subjectMatches.map((certificate) => certificate.name).join(", ");
    throw new Error(
      [
        `[${scopeLabel}] ${managedCertificateEnvVar}='${normalizedCertificateName}' was not found in ACA environment`,
        `Domain '${normalizedDomain}' already has managed certificate(s): ${existingNames}`,
        `Use an existing certificate name in ${managedCertificateEnvVar} to adopt the current resource`
      ].join("\n")
    );
  }

  return {
    scopeLabel,
    customDomain: normalizedDomain,
    managedCertificateName: normalizedCertificateName,
    mode: "create"
  };
}
