// Label values are i18n KEY STRINGS (shared:clientProperty.*). The consuming
// component wraps each with t() when rendering the option label.
export const RESIDENTIAL_PROPERTY_TYPES = [
  { value: 'single_family', label: 'shared:clientProperty.residential.single_family' },
  { value: 'townhouse', label: 'shared:clientProperty.residential.townhouse' },
  { value: 'condo', label: 'shared:clientProperty.residential.condo' },
  { value: 'duplex', label: 'shared:clientProperty.residential.duplex' },
  { value: 'triplex_quad', label: 'shared:clientProperty.residential.triplex_quad' },
  { value: 'mobile_home', label: 'shared:clientProperty.residential.mobile_home' },
  { value: 'apartment_building', label: 'shared:clientProperty.residential.apartment_building' },
  { value: 'other', label: 'shared:clientProperty.residential.other' },
]

export const COMMERCIAL_PROPERTY_TYPES = [
  { value: 'office', label: 'shared:clientProperty.commercial.office' },
  { value: 'retail', label: 'shared:clientProperty.commercial.retail' },
  { value: 'warehouse', label: 'shared:clientProperty.commercial.warehouse' },
  { value: 'restaurant', label: 'shared:clientProperty.commercial.restaurant' },
  { value: 'medical', label: 'shared:clientProperty.commercial.medical' },
  { value: 'hotel', label: 'shared:clientProperty.commercial.hotel' },
  { value: 'education', label: 'shared:clientProperty.commercial.education' },
  { value: 'multi_unit', label: 'shared:clientProperty.commercial.multi_unit' },
  { value: 'religious', label: 'shared:clientProperty.commercial.religious' },
  { value: 'government', label: 'shared:clientProperty.commercial.government' },
  { value: 'other', label: 'shared:clientProperty.commercial.other' },
]

export const BILLING_TERMS = [
  { value: 'due_on_receipt', label: 'shared:clientProperty.billingTerms.due_on_receipt' },
  { value: 'net_15', label: 'shared:clientProperty.billingTerms.net_15' },
  { value: 'net_30', label: 'shared:clientProperty.billingTerms.net_30' },
  { value: 'net_45', label: 'shared:clientProperty.billingTerms.net_45' },
  { value: 'net_60', label: 'shared:clientProperty.billingTerms.net_60' },
  { value: 'custom', label: 'shared:clientProperty.billingTerms.custom' },
]

export const CONTACT_METHODS = [
  { value: 'email', label: 'shared:clientProperty.contactMethods.email' },
  { value: 'phone', label: 'shared:clientProperty.contactMethods.phone' },
  { value: 'sms', label: 'shared:clientProperty.contactMethods.sms' },
  { value: 'whatsapp', label: 'shared:clientProperty.contactMethods.whatsapp' },
]
