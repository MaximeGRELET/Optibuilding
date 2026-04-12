"""
Consignes de température horaires pour le chauffage et la climatisation.

SetpointSchedule contient deux tableaux horaires (8 760 valeurs) :
- heating_sp_c : consigne de chauffage [°C]
- cooling_sp_c : consigne de refroidissement [°C]

Le moteur maintient Tair dans la plage [heating_sp_c, cooling_sp_c].
En dehors de cette plage, la puissance HVAC est calculée (besoins).
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass
class SetpointSchedule:
    """Consignes de température horaires [°C].

    Attributes
    ----------
    heating_sp_c : consigne chauffage — 8 760 valeurs [°C]
    cooling_sp_c : consigne refroidissement — 8 760 valeurs [°C]
    """
    heating_sp_c: np.ndarray  # (8760,)
    cooling_sp_c: np.ndarray  # (8760,)

    def __post_init__(self) -> None:
        if len(self.heating_sp_c) != 8760 or len(self.cooling_sp_c) != 8760:
            raise ValueError("SetpointSchedule : les deux tableaux doivent contenir 8 760 valeurs.")

    # ── Constructeurs de profils types ────────────────────────

    @classmethod
    def constant(
        cls,
        t_heat: float = 19.0,
        t_cool: float = 26.0,
    ) -> "SetpointSchedule":
        """Consignes constantes toute l'année."""
        return cls(
            heating_sp_c=np.full(8760, t_heat),
            cooling_sp_c=np.full(8760, t_cool),
        )

    @classmethod
    def typical_residential(
        cls,
        t_heat_day: float = 19.0,
        t_heat_night: float = 16.0,
        t_cool: float = 26.0,
        day_start_h: int = 7,
        day_end_h: int = 23,
    ) -> "SetpointSchedule":
        """Profil résidentiel type (7 j/7).

        Chauffage jour (7h–23h) : t_heat_day
        Chauffage nuit (23h–7h) : t_heat_night
        Refroidissement         : t_cool (constant)
        """
        heat = np.full(8760, t_heat_night)
        for day in range(365):
            s = day * 24
            heat[s + day_start_h: s + day_end_h] = t_heat_day
        return cls(
            heating_sp_c=heat,
            cooling_sp_c=np.full(8760, t_cool),
        )

    @classmethod
    def typical_office(
        cls,
        t_heat_occ: float = 21.0,
        t_heat_unocc: float = 16.0,
        t_cool_occ: float = 25.0,
        t_cool_unocc: float = 30.0,
        occ_start_h: int = 8,
        occ_end_h: int = 18,
    ) -> "SetpointSchedule":
        """Profil bureau (lundi–vendredi, 8h–18h occupé)."""
        heat = np.full(8760, t_heat_unocc)
        cool = np.full(8760, t_cool_unocc)
        for day in range(365):
            dow = day % 7  # 0=lundi, 6=dimanche
            if dow < 5:    # jours ouvrés
                s = day * 24
                heat[s + occ_start_h: s + occ_end_h] = t_heat_occ
                cool[s + occ_start_h: s + occ_end_h] = t_cool_occ
        return cls(heating_sp_c=heat, cooling_sp_c=cool)

    @classmethod
    def typical_retail(
        cls,
        t_heat: float = 19.0,
        t_heat_closed: float = 12.0,
        t_cool: float = 26.0,
        open_start_h: int = 8,
        open_end_h: int = 20,
    ) -> "SetpointSchedule":
        """Profil commerce (7 j/7, 8h–20h ouvert)."""
        heat = np.full(8760, t_heat_closed)
        for day in range(365):
            s = day * 24
            heat[s + open_start_h: s + open_end_h] = t_heat
        return cls(
            heating_sp_c=heat,
            cooling_sp_c=np.full(8760, t_cool),
        )

    @classmethod
    def from_usage(cls, usage: str, **kwargs) -> "SetpointSchedule":
        """Sélectionne le profil selon le type d'usage."""
        usage = usage.lower()
        if "office" in usage or "bureau" in usage:
            return cls.typical_office(**kwargs)
        if "retail" in usage or "commerce" in usage:
            return cls.typical_retail(**kwargs)
        return cls.typical_residential(**kwargs)

    @classmethod
    def from_zone_properties(
        cls,
        usage: str,
        heating_day_c: float | None = None,
        heating_night_c: float | None = None,
        cooling_c: float | None = None,
    ) -> "SetpointSchedule":
        """Crée un profil à partir des propriétés de zone GeoJSON."""
        t_cool = cooling_c if cooling_c is not None else 26.0
        t_heat_day = heating_day_c if heating_day_c is not None else 19.0
        t_heat_night = heating_night_c if heating_night_c is not None else 16.0

        usage_l = usage.lower()
        if "office" in usage_l or "bureau" in usage_l:
            return cls.typical_office(
                t_heat_occ=t_heat_day,
                t_heat_unocc=t_heat_night,
                t_cool_occ=t_cool,
            )
        if "retail" in usage_l or "commerce" in usage_l:
            return cls.typical_retail(
                t_heat=t_heat_day,
                t_heat_closed=t_heat_night,
                t_cool=t_cool,
            )
        # Résidentiel par défaut
        return cls.typical_residential(
            t_heat_day=t_heat_day,
            t_heat_night=t_heat_night,
            t_cool=t_cool,
        )
