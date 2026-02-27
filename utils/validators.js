exports.voucherPattern = /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/;

exports.isEmail = (s) => typeof s === 'string' && /@/.test(s);
exports.isPhone = (s) => typeof s === 'string' && /^[0-9+\- ]{7,15}$/.test(s);
