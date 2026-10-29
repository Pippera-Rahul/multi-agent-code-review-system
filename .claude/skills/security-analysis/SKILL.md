---
name: security-analysis
description: Review code for security vulnerabilities, unsafe data handling, and access-control weaknesses.
---

# Security Analysis

When reviewing security-sensitive code:

- Check validation and sanitization of untrusted input.
- Look for injection risks, including SQL, shell, and code injection.
- Check authentication, authorization, and access-control enforcement.
- Identify exposed credentials, tokens, secrets, or sensitive information.
- Review file-system access, path traversal, and unsafe file operations.
- Check network requests, URL validation, and unsafe deserialization.
- Review error messages and logs for sensitive data exposure.
- Check cryptographic and session-handling practices when relevant.
- Distinguish demonstrated vulnerabilities from speculative concerns.
- Report actionable findings with file, line, severity, impact, and remediation.
