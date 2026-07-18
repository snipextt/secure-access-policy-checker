const mockRules = [
  {
    ruleId: 101,
    ruleName: "TEST block destination rule",
    rulePriority: 10,
    ruleAction: "block",
    ruleIsEnabled: true,
    ruleConditions: [
      {
        attributeName: "umbrella.destination.composite_inline_ip",
        attributeOperator: "IN",
        attributeValue: [
          { ip: ["93.184.216.0/24"], port: ["0-65535"], protocol: "ANY" }
        ]
      }
    ]
  },
  {
    ruleId: 103,
    ruleName: "TEST app category rule",
    rulePriority: 15,
    ruleAction: "block",
    ruleIsEnabled: true,
    ruleConditions: [
      {
        attributeName: "umbrella.destination.application_category_ids",
        attributeOperator: "INTERSECT",
        attributeValue: [102]
      }
    ]
  }
];

const mockFindings = [
  {
    ruleId: 101,
    checkId: "SEC_PROFILE_MISSING",
    severity: "high",
    message: "Missing security profiles",
    detail: "No IPS configured"
  }
];

if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
  window.browser = window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        if (msg.type === "RUN_SCAN") {
          setTimeout(() => cb({ rules: mockRules, findings: mockFindings }), 100);
        }
      }
    },
    tabs: {
      query: (q, cb) => cb([]),
      sendMessage: (id, msg, cb) => cb()
    }
  };
}
