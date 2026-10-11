let converters;
export async function convertText(text, script = 'simplified') {
    if (!converters) converters = import('./vendor/opencc.js?v=10.8.2').then(OpenCC => ({ simplified: OpenCC.Converter({from:'t',to:'cn'}), traditional: OpenCC.Converter({from:'cn',to:'t'}) }));
    const loaded = await converters;
    return loaded[script === 'traditional' ? 'traditional' : 'simplified'](String(text || ''));
}
