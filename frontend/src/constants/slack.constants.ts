const formatMrkdwn = (text: string) =>
    text
        .replace(/(^|[^\w*])\*(\S(?:[^*\n]*?\S)?)\*(?![\w*])/g, '$1**$2**')
        .replace(/(^|[^\w_])_(\S(?:[^_\n]*?\S)?)_(?![\w_])/g, '$1*$2*')
        .replace(/(^|[^\w~])~(\S(?:[^~\n]*?\S)?)~(?![\w~])/g, '$1~~$2~~');

const convertEntity = (entity: string, resolveUserName: (userId: string) => string | undefined) => {
    const [target, label] = entity.split('|', 2);
    if (target.startsWith('@')) return '@' + (label ?? resolveUserName(target.substring(1)) ?? target.substring(1));
    if (target.startsWith('#')) return '#' + (label ?? target.substring(1));
    if (target.startsWith('!')) return label ?? '@' + target.substring(1).split('^')[0];
    if (!label || label === target) return target;
    return `[${label}](${target})`;
};

export const slack2markdown = (mrkdwn: string, resolveUserName: (userId: string) => string | undefined = () => undefined) =>
    mrkdwn
        .split(/(<[^<>]+>)/)
        .map((part) => (/^<[^<>]+>$/.test(part) ? convertEntity(part.slice(1, -1), resolveUserName) : formatMrkdwn(part)))
        .join('');
