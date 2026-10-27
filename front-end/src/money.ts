// formats a dollar figure as canadian currency, e.g. $1,297.81

export const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
