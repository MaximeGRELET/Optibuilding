"""
Apports thermiques internes horaires.

InternalGainsSchedule contient la puissance sensible horaire [W]
et la fraction rayonnée (vers Tmr) vs convectée (vers Tair).
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np


# Fraction radiative par défaut selon la source d'apport
_FRAC_RAD_OCCUPANTS = 0.50   # occupants (moitié rayonnement, moitié convection)
_FRAC_RAD_LIGHTING  = 0.63   # éclairage (forte fraction radiative)
_FRAC_RAD_EQUIPMENT = 0.30   # équipements électriques


@dataclass
class InternalGainsSchedule:
    """Apports thermiques internes sensibles horaires.

    Attributes
    ----------
    sensible_w       : puissance sensible totale [W] — tableau (8 760,)
    radiant_fraction : fraction vers Tmr (rayonnement) [-]
    """
    sensible_w: np.ndarray     # (8760,)
    radiant_fraction: float = 0.50

    def __post_init__(self) -> None:
        if len(self.sensible_w) != 8760:
            raise ValueError("InternalGainsSchedule : le tableau doit contenir 8 760 valeurs.")
        self.radiant_fraction = float(np.clip(self.radiant_fraction, 0.0, 1.0))

    # ── Constructeurs de profils types ────────────────────────

    @classmethod
    def zero(cls) -> "InternalGainsSchedule":
        """Aucun apport interne."""
        return cls(sensible_w=np.zeros(8760))

    @classmethod
    def from_constant_density(
        cls,
        floor_area_m2: float,
        gains_w_m2: float = 5.0,
        radiant_fraction: float = 0.50,
    ) -> "InternalGainsSchedule":
        """Apports constants en W/m²."""
        return cls(
            sensible_w=np.full(8760, gains_w_m2 * floor_area_m2),
            radiant_fraction=radiant_fraction,
        )

    @classmethod
    def residential(
        cls,
        floor_area_m2: float,
        n_occupants: int | None = None,
        appliances_w_m2: float = 4.0,
        lighting_w_m2: float = 2.5,
        heat_per_person_w: float = 80.0,
    ) -> "InternalGainsSchedule":
        """Apports résidentiels type (occupants + appareils + éclairage).

        Profil horaire : présence matin (7h–9h) et soir (17h–22h) les jours ouvrés ;
        journée complète le week-end.
        """
        if n_occupants is None:
            n_occupants = max(1, int(floor_area_m2 / 25.0))

        q_occ = n_occupants * heat_per_person_w
        q_app = appliances_w_m2 * floor_area_m2
        q_light = lighting_w_m2 * floor_area_m2

        schedule = _residential_occupancy_profile()

        # Apports sensibles : occupants + appareils proportionnels à la présence + éclairage
        sensible = q_occ * schedule + q_app * np.clip(schedule + 0.1, 0, 1) + q_light * schedule
        rad_frac = (
            q_occ * _FRAC_RAD_OCCUPANTS
            + q_app * _FRAC_RAD_EQUIPMENT
            + q_light * _FRAC_RAD_LIGHTING
        ) / (q_occ + q_app + q_light + 1e-6)

        return cls(sensible_w=sensible, radiant_fraction=float(rad_frac))

    @classmethod
    def office(
        cls,
        floor_area_m2: float,
        persons_per_m2: float = 0.10,
        appliances_w_m2: float = 15.0,
        lighting_w_m2: float = 10.0,
        heat_per_person_w: float = 90.0,
    ) -> "InternalGainsSchedule":
        """Apports de bureaux (lundi–vendredi, 8h–18h)."""
        schedule = _office_occupancy_profile()
        q_occ = persons_per_m2 * floor_area_m2 * heat_per_person_w
        q_app = appliances_w_m2 * floor_area_m2
        q_light = lighting_w_m2 * floor_area_m2

        sensible = (q_occ + q_app + q_light) * schedule
        rad_frac = (
            q_occ * _FRAC_RAD_OCCUPANTS
            + q_app * _FRAC_RAD_EQUIPMENT
            + q_light * _FRAC_RAD_LIGHTING
        ) / (q_occ + q_app + q_light + 1e-6)

        return cls(sensible_w=sensible, radiant_fraction=float(rad_frac))

    @classmethod
    def retail(
        cls,
        floor_area_m2: float,
        persons_per_m2: float = 0.20,
        appliances_w_m2: float = 8.0,
        lighting_w_m2: float = 15.0,
        heat_per_person_w: float = 90.0,
    ) -> "InternalGainsSchedule":
        """Apports de commerce (7j/7, 8h–20h)."""
        schedule = _retail_occupancy_profile()
        q_occ = persons_per_m2 * floor_area_m2 * heat_per_person_w
        q_app = appliances_w_m2 * floor_area_m2
        q_light = lighting_w_m2 * floor_area_m2

        sensible = (q_occ + q_app + q_light) * schedule
        rad_frac = (
            q_occ * _FRAC_RAD_OCCUPANTS
            + q_app * _FRAC_RAD_EQUIPMENT
            + q_light * _FRAC_RAD_LIGHTING
        ) / (q_occ + q_app + q_light + 1e-6)

        return cls(sensible_w=sensible, radiant_fraction=float(rad_frac))

    @classmethod
    def from_usage(
        cls,
        usage: str,
        floor_area_m2: float,
        n_occupants: int | None = None,
        appliances_w_m2: float | None = None,
        lighting_w_m2: float | None = None,
    ) -> "InternalGainsSchedule":
        """Sélectionne le profil selon l'usage."""
        usage_l = usage.lower()
        if "office" in usage_l or "bureau" in usage_l:
            kw = {}
            if appliances_w_m2 is not None:
                kw["appliances_w_m2"] = appliances_w_m2
            if lighting_w_m2 is not None:
                kw["lighting_w_m2"] = lighting_w_m2
            return cls.office(floor_area_m2, **kw)
        if "retail" in usage_l or "commerce" in usage_l:
            kw = {}
            if appliances_w_m2 is not None:
                kw["appliances_w_m2"] = appliances_w_m2
            if lighting_w_m2 is not None:
                kw["lighting_w_m2"] = lighting_w_m2
            return cls.retail(floor_area_m2, **kw)
        # Résidentiel par défaut
        kw = {}
        if n_occupants is not None:
            kw["n_occupants"] = n_occupants
        if appliances_w_m2 is not None:
            kw["appliances_w_m2"] = appliances_w_m2
        if lighting_w_m2 is not None:
            kw["lighting_w_m2"] = lighting_w_m2
        return cls.residential(floor_area_m2, **kw)


# ── Profils d'occupation internes ─────────────────────────────────────────────

def _residential_occupancy_profile() -> np.ndarray:
    """Profil d'occupation résidentiel [0–1] — 8 760 valeurs."""
    occ = np.zeros(8760)
    for day in range(365):
        s = day * 24
        dow = day % 7
        if dow < 5:  # jours ouvrés
            occ[s:s + 7] = 0.80    # 0h–7h : nuit (présents mais au repos)
            occ[s + 7:s + 9] = 0.5  # 7h–9h : départ progressif
            occ[s + 9:s + 17] = 0.1 # 9h–17h : absents (travail)
            occ[s + 17:s + 23] = 0.9 # 17h–23h : présents (soir)
            occ[s + 23] = 0.80
        else:  # week-end
            occ[s:s + 9] = 0.90
            occ[s + 9:s + 22] = 0.70
            occ[s + 22:] = 0.90
    return occ


def _office_occupancy_profile() -> np.ndarray:
    """Profil d'occupation bureau [0–1] — lundi–vendredi 8h–18h."""
    occ = np.zeros(8760)
    for day in range(365):
        dow = day % 7
        if dow < 5:  # jours ouvrés
            s = day * 24
            occ[s + 8:s + 18] = 1.0
    return occ


def _retail_occupancy_profile() -> np.ndarray:
    """Profil d'occupation commerce [0–1] — 7j/7, 8h–20h."""
    occ = np.zeros(8760)
    for day in range(365):
        s = day * 24
        occ[s + 8:s + 20] = 1.0
    return occ
