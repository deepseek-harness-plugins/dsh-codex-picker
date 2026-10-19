export function pickerModel(state, accountProviderName) {
  const groups = [...state.groups].sort((left, right) => {
    const rank = id => id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2;
    return rank(left.id) - rank(right.id);
  }).map(group => ({...group, choices: group.models.map(model => ({
    provider: group.id, providerName: group.id === 'deepseek-account' && accountProviderName
      ? accountProviderName : group.provider?.name || group.name || group.id,
    providerInfo: group.id === 'deepseek-account' && accountProviderName
      ? {...group.provider, id: group.id, name: accountProviderName}
      : group.provider ?? {id: group.id, name: group.name || group.id}, model,
    selected: group.id === state.current?.provider && model.id === state.current.model,
  }))}));
  const choices = groups.flatMap(group => group.choices);
  const current = choices.find(choice => choice.selected);
  const reasoning = current?.model.reasoning;
  const effort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
  const levels = reasoning ? [
    ...(reasoning.defaultEffort === undefined ? [{key: 'provider-default', id: undefined, label: 'Default'}] : []),
    ...reasoning.efforts.filter(level => level.id.toLowerCase() !== 'ultra')
      .map(level => ({key: level.id, id: level.id, label: level.id})),
  ] : [];
  return {groups, choices, current, levels, effort, label: reasoning ? effort ?? 'Default' : ''};
}

export function filterModelGroups(groups, query) {
  const needle = query.trim().toLowerCase();
  return groups.map(group => ({...group, choices: group.choices.filter(choice =>
    `${choice.model.name} ${choice.model.id} ${choice.providerName}`.toLowerCase().includes(needle)),
  })).filter(group => group.choices.length > 0);
}

export function modelSelection(choice) {
  const effort = choice.model.reasoning?.defaultEffort;
  return {provider: choice.provider, model: choice.model.id,
    ...(effort === undefined ? {} : {reasoningEffort: effort})};
}
