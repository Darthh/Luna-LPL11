// Fictional sample records. These never enter the account database.
export function demoClients() {
  const people = [
    [
      "Morgan household",
      "Alex Morgan",
      "Active",
      "Growth",
      "Core equity",
      1245000,
    ],
    [
      "Chen family trust",
      "Jamie Chen",
      "Active",
      "Moderate",
      "Balanced income",
      2180000,
    ],
    [
      "Patel retirement",
      "Priya Patel",
      "Onboarding",
      "Conservative",
      "Capital preservation",
      865000,
    ],
    [
      "Williams family",
      "Jordan Williams",
      "Active",
      "Growth",
      "Tax-aware growth",
      1540000,
    ],
    [
      "Rivera household",
      "Sam Rivera",
      "Prospect",
      "Moderate",
      "Balanced income",
      420000,
    ],
    [
      "Bennett living trust",
      "Taylor Bennett",
      "Active",
      "Conservative",
      "Capital preservation",
      3275000,
    ],
    [
      "Park & Ellis",
      "Casey Park",
      "Active",
      "Aggressive",
      "Global opportunities",
      975000,
    ],
    [
      "Reed retirement",
      "Avery Reed",
      "Onboarding",
      "Moderate",
      "Balanced income",
      680000,
    ],
    [
      "Sullivan household",
      "Riley Sullivan",
      "Active",
      "Growth",
      "Core equity",
      1820000,
    ],
    [
      "Brooks family",
      "Drew Brooks",
      "Prospect",
      "Growth",
      "Tax-aware growth",
      350000,
    ],
    [
      "Foster foundation",
      "Quinn Foster",
      "Active",
      "Moderate",
      "Balanced income",
      4620000,
    ],
    [
      "Hayes household",
      "Cameron Hayes",
      "Active",
      "Conservative",
      "Capital preservation",
      735000,
    ],
  ];
  const date = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return people.map(([name, contact, stage, risk, strategy, value], i) => ({
    id: `sample-${i}`,
    revision: 1,
    name,
    email: `${contact.toLowerCase().replaceAll(" ", ".")}@example.com`,
    phone: "",
    advisor: i % 3 === 0 ? "Jamie Lee" : "Alex Taylor",
    stage,
    risk,
    lastContact: date(-3 - i * 2),
    nextReview: date(i * 4 - 8),
    notes: `Sample record for ${contact}. Review investment objectives, liquidity needs, and the current strategy at the next meeting.`,
    portfolios: [
      {
        name: "Investment account",
        strategy,
        value: value * 0.8,
        valueDate: date(-2),
        holdings: "VTI, VXUS, BND",
      },
      {
        name: "Retirement account",
        strategy: "Balanced income",
        value: value * 0.2,
        valueDate: date(-2),
        holdings: "VTI, BND",
      },
    ],
  }));
}
