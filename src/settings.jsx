import React, {useState, useSyncExternalStore} from 'react';

export function PickerSettings({preferences}) {
  const settings = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const [error, setError] = useState('');
  const change = pickerStyle => {
    try {preferences.update({pickerStyle}); setError('');}
    catch (e) {setError('设置未保存：' + e.message);}
  };
  return <section className="dcp-settings" aria-label="模型选择器样式">
    <div className="dcp-setting-row"><span id="dcp-picker-label">模型选择器</span>
      <div className="dcp-segmented" role="radiogroup" aria-labelledby="dcp-picker-label">
        {[['deepseek', 'DeepSeek 默认'], ['codex', 'Codex']].map(([value, label]) => <label key={value}>
          <input type="radio" name="dcp-picker-style" value={value} checked={settings.pickerStyle === value}
            onChange={() => change(value)}/><span>{label}</span>
        </label>)}
      </div>
    </div>
    {error && <p className="dcp-error" role="alert">{error}</p>}
  </section>;
}
