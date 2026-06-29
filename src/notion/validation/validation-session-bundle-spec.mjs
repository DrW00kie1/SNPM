export const VALIDATION_BUNDLE_PRIMARY_VIEW = "Active Sessions";
export const VALIDATION_BUNDLE_QUICK_INTAKE_FORM = "Quick Intake";
export const VALIDATION_BUNDLE_TEMPLATE_NAME = "Validation Session";
export const VALIDATION_BUNDLE_BUTTON_LABEL = "New Validation Session";
export const VALIDATION_BUNDLE_EXTRA_URL_PROPERTY = "Issue URL";
export const VALIDATION_BUNDLE_TEMPLATE_TITLE_PLACEHOLDER = "<Session Title>";
export const VALIDATION_BUNDLE_TEMPLATE_CANONICAL_SUFFIX = `Validation Sessions > ${VALIDATION_BUNDLE_TEMPLATE_TITLE_PLACEHOLDER}`;

export const VALIDATION_BUNDLE_API_ONLY_MANUAL_CHECKS = [
  {
    id: "active-sessions-view",
    title: "Active Sessions view",
    status: "manual-required",
    reason: "View management remains outside the public Notion API.",
  },
  {
    id: "quick-intake-form",
    title: "Quick Intake form",
    status: "manual-required",
    reason: "Form setup and wiring remain outside the public Notion API.",
  },
  {
    id: "validation-session-template",
    title: "Validation Session template",
    status: "manual-required",
    reason: "Template selection and default-template wiring remain outside the public Notion API.",
  },
  {
    id: "button-wiring",
    title: "Manual button wiring",
    status: "manual-required",
    reason: "Button setup around the validation surface remains outside the public Notion API.",
  },
];

export function buildValidationSessionBundleMetadata() {
  return {
    bundle: {
      enabled: true,
      primaryView: VALIDATION_BUNDLE_PRIMARY_VIEW,
      backupIntakeForm: VALIDATION_BUNDLE_QUICK_INTAKE_FORM,
      databaseTemplate: VALIDATION_BUNDLE_TEMPLATE_NAME,
      buttonLabel: VALIDATION_BUNDLE_BUTTON_LABEL,
      safeExtraProperties: [{
        name: VALIDATION_BUNDLE_EXTRA_URL_PROPERTY,
        type: "url",
      }],
    },
    manualChecks: VALIDATION_BUNDLE_API_ONLY_MANUAL_CHECKS,
  };
}

export function buildValidationSessionTemplateCanonicalPath(projectName) {
  return `Projects > ${projectName} > Ops > Validation > ${VALIDATION_BUNDLE_TEMPLATE_CANONICAL_SUFFIX}`;
}

export function isValidationSessionCanonicalSourceAccepted(actualCanonical, projectName, rowTitle) {
  const exactCanonical = `Projects > ${projectName} > Ops > Validation > Validation Sessions > ${rowTitle}`;
  return actualCanonical === exactCanonical
    || actualCanonical === buildValidationSessionTemplateCanonicalPath(projectName);
}
