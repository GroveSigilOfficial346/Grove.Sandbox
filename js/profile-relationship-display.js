function renderSummary(partner) {
  const summary = panel.querySelector(".grove-rel-summary");
  summary.replaceChildren();

  const status = profileData?.relationship_status;
  const statusLabel = LABELS[status];

  if (status && status !== "not_set" && statusLabel) {
    summary.append(el("span", "", "Status: " + statusLabel));
  } else if (isOwner) {
    summary.append(el("span", "", "Status: Not set"));
  }

  const since = dateLabel(profileData?.relationship_since);

  if (since) {
    summary.append(el("span", "", "Since: " + since));
  }

  if (partner && tagRecord?.status === "accepted") {
    summary.append(
      el(
        "span",
        "",
        "With: " + (partner.display_name || "@" + partner.username)
      )
    );
  }
}
