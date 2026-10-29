---
name: typescript-patterns
description: Review TypeScript code for type safety, modern patterns, async correctness, and maintainability.
---

# TypeScript Patterns

When reviewing TypeScript code:

- Prefer specific types over `any`; use `unknown` when a value's type is not yet known.
- Check null and undefined handling, optional properties, and unsafe type assertions.
- Use discriminated unions and type narrowing where they improve correctness.
- Check async/await usage, rejected promises, and error handling.
- Look for duplicated logic, unclear abstractions, and unnecessarily complex types.
- Review function inputs, return types, interfaces, and exported APIs for consistency.
- Check array/object handling and avoid mutations that could cause unintended side effects.
- Report only actionable issues supported by the code. Include file, line, severity, explanation, and a practical fix.
