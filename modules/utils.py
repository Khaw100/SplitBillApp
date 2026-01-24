from babel.numbers import format_currency

from modules.data import session_data

CURRENCY_LIST = {
    "USD": "en_US",
    "EUR": "de_DE",
    "JPY": "ja_JP",
    "GBP": "en_GB",
    "AUD": "en_AU",
    "CAD": "en_CA",
    "CHF": "de_CH",
    "CNY": "zh_CN",
    "INR": "hi_IN",
    "BRL": "pt_BR",
    "RUB": "ru_RU",
    "KRW": "ko_KR",
    "MXN": "es_MX",
    "IDR": "id_ID",
    "ZAR": "en_ZA",
    "SEK": "sv_SE",
    "NZD": "en_NZ",
    "SGD": "en_SG",
    "HKD": "zh_HK",
    "AED": "ar_AE",
}


def format_number_to_currency(val: float) -> str:
    currency = session_data.currency.get()
    locale = CURRENCY_LIST.get(currency)
    if not locale:
        return str(val)
    return format_currency(val, currency, locale=locale, format="¤ #,##0.00")


class AIError(Exception):
    pass


class SettingsError(Exception):
    pass
