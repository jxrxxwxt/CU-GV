from django.db import models


class ShortReadVariant(models.Model):
    chromosome = models.TextField()
    position = models.IntegerField()
    variant_id = models.TextField()
    ref = models.TextField()
    alt = models.TextField()
    ac = models.IntegerField()
    af = models.FloatField()
    an = models.IntegerField()
    unique_key = models.TextField(unique=True, null=True)

    def save(self, *arg, **kwargs):
        self.unique_key = f"{self.chromosome}_{self.position}_{self.ref}_{self.alt}"
        super().save(*arg, **kwargs)


class ShortReadPatient(models.Model):
    patient_id = models.TextField(primary_key=True)
    gender = models.TextField(blank=True, null=True)
    diagnosis = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.patient_id


class ShortReadGenotype(models.Model):
    patient = models.ForeignKey("ShortReadPatient", on_delete=models.CASCADE)
    variant = models.ForeignKey("ShortReadVariant", on_delete=models.CASCADE)
    genotype = models.CharField(max_length=10)

    class Meta:
        indexes = [
            models.Index(fields=["variant", "patient"]),
            models.Index(fields=["variant", "genotype"]),
        ]

    def __str__(self):
        return f"{self.patient.patient_id} @ {self.variant} -> {self.genotype}"


class LongReadVariantV2(models.Model):
    chromosome = models.TextField(db_index=True)
    position = models.PositiveIntegerField(db_index=True)
    variant_id = models.TextField(db_index=True, null=True)
    ref = models.TextField()
    alt = models.TextField()
    af = models.FloatField(null=True)

    def save(self, *args, **kwargs):
        if self.variant_id and not self.variant_id.startswith("chr"):
            self.variant_id = f"chr{self.variant_id}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.variant_id or f"{self.chromosome}:{self.position}"


class LongReadPatientV2(models.Model):
    patient_id = models.TextField(primary_key=True)
    gender = models.TextField(blank=True, null=True)
    diagnosis = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.patient_id


class LongReadGenotypeV2(models.Model):
    patient = models.ForeignKey("LongReadPatientV2", on_delete=models.CASCADE)
    variant = models.ForeignKey("LongReadVariantV2", on_delete=models.CASCADE)
    genotype = models.TextField()

    class Meta:
        indexes = [
            models.Index(fields=["variant", "patient"]),
            models.Index(fields=["variant", "genotype"]),
        ]

    def __str__(self):
        return f"{self.patient.patient_id} @ {self.variant} -> {self.genotype}"
