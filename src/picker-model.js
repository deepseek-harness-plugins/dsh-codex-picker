export function pickerModel(state) {
  const choices = state.groups.flatMap(group => group.models.map(model => ({
    provider: group.id, providerName: group.name, model,
    selected: group.id === state.current?.provider && model.id === state.current.model,
  })));
  const current = choices.find(choice => choice.selected);
  const reasoning = current?.model.reasoning;
  const effort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
  const levels = reasoning ? [
    ...(reasoning.defaultEffort === undefined ? [{key: 'provider-default', id: undefined, label: 'Default'}] : []),
    ...reasoning.efforts.filter(level => level.id.toLowerCase() !== 'ultra')
      .map(level => ({key: level.id, id: level.id, label: level.id})),
  ] : [];
  return {choices, current, levels, effort, label: reasoning ? effort ?? 'Default' : ''};
}

export function modelSelection(choice) {
  const effort = choice.model.reasoning?.defaultEffort;
  return {provider: choice.provider, model: choice.model.id,
    ...(effort === undefined ? {} : {reasoningEffort: effort})};
}
