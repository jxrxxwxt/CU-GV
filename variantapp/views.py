from django.views.decorators.http import require_GET
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from django.contrib.auth import logout
from django.core.cache import cache
from django.shortcuts import render, redirect
from django.http import JsonResponse
from .models import (
    ShortReadVariant,
    ShortReadGenotype,
    LongReadVariantV2,
    LongReadGenotypeV2,
)
from .forms import CustomLoginForm
import requests


class CustomLoginView(LoginView):
    """
    Custom login view using a custom authentication form.
    Redirects staff users to the admin dashboard, others to the home page.
    """

    template_name = "login.html"
    authentication_form = CustomLoginForm

    def get_success_url(self):
        user = self.request.user
        if user.is_staff:
            return "/admin/"
        else:
            return "/"


def logout_view(request):
    """
    Logs out the current user and redirects them to the login page.
    """
    logout(request)
    return redirect("/login/")


@login_required
def index(request):
    """
    Renders the main index page.
    Access is restricted to logged-in users only.
    """
    return render(request, "index.html")


def get_variant_annotation(chrom, pos, alt):
    """
    Calls the Ensembl VEP API to get variant annotation information
    based on chromosome, position, and alternative allele.

    Returns a dictionary with gene name, consequence, impact,
    and most severe consequence if successful, otherwise None.
    """
    server = "https://rest.ensembl.org"
    ext = f"/vep/human/region/{chrom}:{pos}-{pos}/{alt}?"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    response = requests.get(server + ext, headers=headers)

    if not response.ok:
        return None

    data = response.json()
    if data and isinstance(data, list) and len(data) > 0:
        most_severe_consequence = data[0].get("most_severe_consequence", "-")
        transcript_consequences = data[0].get("transcript_consequences", [])
        gene_name = "-"
        impact = "-"
        consequence = "-"
        if transcript_consequences:
            first_tc = transcript_consequences[0]
            gene_name = first_tc.get("gene_symbol", "-") or first_tc.get("gene_id", "-")
            impact = first_tc.get("impact", "-")
            consequence = first_tc.get("consequence_terms", ["-"])[0]
        return {
            "gene": gene_name,
            "consequence": consequence,
            "impact": impact,
            "most_severe_consequence": most_severe_consequence,
        }
    return None


@login_required
@require_GET
def get_variant_annotation_ajax(request):
    """
    AJAX view to retrieve variant annotation details.

    Expects 'chrom', 'pos', and 'alt' as GET parameters.
    Returns JSON with annotation data or error message.
    Returns HTTP 200 with error JSON to avoid browser console errors.
    """
    chrom = request.GET.get("chrom")
    pos = request.GET.get("pos")
    alt = request.GET.get("alt")

    if not all([chrom, pos, alt]):
        # Missing parameters; return error in JSON with status 200
        return JsonResponse({"error": "Missing parameters"}, status=200)

    annotation = get_variant_annotation(chrom, pos, alt)
    if annotation:
        return JsonResponse(annotation)
    else:
        # Annotation not found; return error JSON with status 200
        return JsonResponse({"error": "Annotation not found"}, status=200)


@login_required
def variant_detail(request):
    """
    View for variant details page.

    Accepts a 'query' GET parameter that can be either:
    - A unique key in the format chr_pos_ref_alt, or
    - A variant ID (e.g., rsID).

    Searches both short-read and long-read variant tables and combines results.
    Passes merged variant data to the template.
    """
    query = request.GET.get("query", "").strip()  # Sanitize query input
    variant_objs = []  # To hold short-read variants matching query
    longread_variant_map = (
        {}
    )  # To hold long-read variant mapping by unique key or variant_id

    if not query:
        pass
    elif "_" in query:
        # Query is treated as unique_key format chr_pos_ref_alt
        variant_objs = list(ShortReadVariant.objects.filter(unique_key=query))

        # Try to find matching long-read variant by variant_id
        try:
            lr = LongReadVariantV2.objects.get(variant_id=query)
            longread_variant_map[query] = lr
        except LongReadVariantV2.DoesNotExist:
            pass
    else:
        # Query is treated as variant_id (rsID)
        variant_objs = list(ShortReadVariant.objects.filter(variant_id=query))

        if variant_objs:
            first_variant = variant_objs[0]
            unique_key = f"{first_variant.chromosome}_{first_variant.position}_{first_variant.ref}_{first_variant.alt}"

            try:
                lr = LongReadVariantV2.objects.get(variant_id=unique_key)
                longread_variant_map[unique_key] = lr
            except LongReadVariantV2.DoesNotExist:
                pass

    # Aggregate all unique keys from both variant sets
    all_unique_keys = set([v.unique_key for v in variant_objs]) | set(
        longread_variant_map.keys()
    )

    combined_variants = []  # List to hold merged variant info dictionaries

    # Merge short-read and long-read variant data by unique key
    for uk in all_unique_keys:
        variant = next((v for v in variant_objs if v.unique_key == uk), None)
        longread = longread_variant_map.get(uk)

        combined_variants.append(
            {
                "unique_key": uk,
                "variant_id": (variant.variant_id if variant else None),
                "chromosome": (
                    variant.chromosome
                    if variant
                    else (longread.chromosome if longread else None)
                ),
                "position": (
                    variant.position
                    if variant
                    else (longread.position if longread else None)
                ),
                "ref": variant.ref if variant else (longread.ref if longread else None),
                "alt": variant.alt if variant else (longread.alt if longread else None),
                "af_shortread": variant.af if variant else None,
                "af_longread": longread.af if longread else None,
                "ac": variant.ac if variant else None,
                "an": variant.an if variant else None,
            }
        )

    context = {
        "combined_variants": combined_variants,
        "query": query,
    }

    return render(request, "variant_detail.html", context)


@login_required
@require_GET
def get_patients_ajax(request):
    """
    AJAX view to retrieve short-read patient genotype data for a variant.
    Accepts: unique_key (variant_id), supports caching, filtering, searching, pagination.
    """
    input_key = request.GET.get("unique_key")
    page = int(request.GET.get("page", 1))
    filter_type = request.GET.get("filter", "all")
    search_term = request.GET.get("search", "").lower()
    preload = request.GET.get("preload", "false").lower() == "true"
    per_page = 50

    if not input_key:
        return JsonResponse({"error": "No unique_key provided"})

    # Determine unique_key from variant_id or direct input
    try:
        if "_" in input_key:
            variant = ShortReadVariant.objects.get(unique_key=input_key)
        else:
            variant = ShortReadVariant.objects.get(variant_id=input_key)
        unique_key = variant.unique_key
    except ShortReadVariant.DoesNotExist:
        return JsonResponse({"error": "Variant not found"})

    # Check cache
    cache_key = f"shortread_patients_data:{unique_key}"
    cached_data = cache.get(cache_key)

    if cached_data:
        data_all = cached_data["data_all"]
        data_homo = cached_data["data_homo"]
        data_hetero = cached_data["data_hetero"]
        total_homo = cached_data["total_homo"]
        total_hetero = cached_data["total_hetero"]
    else:
        # Query all genotypes of this variant
        genotype_qs = ShortReadGenotype.objects.select_related("patient").filter(
            variant=variant
        )

        data_all = []
        data_homo = []
        data_hetero = []
        total_homo = 0
        total_hetero = 0

        for entry in genotype_qs.iterator(chunk_size=100):
            genotype = entry.genotype
            patient = entry.patient

            patient_data = {
                "patient_id": patient.patient_id,
                "genotype": genotype,
                "gender": patient.gender or "",
                "diagnosis": patient.diagnosis or "",
            }

            if genotype == "1/1":
                data_homo.append(patient_data)
                total_homo += 1
            elif genotype == "0/1":
                data_hetero.append(patient_data)
                total_hetero += 1

            if genotype in ["0/1", "1/1"]:
                data_all.append(patient_data)

        # Store cache for 1 hour
        cache.set(
            cache_key,
            {
                "data_all": data_all,
                "data_homo": data_homo,
                "data_hetero": data_hetero,
                "total_homo": total_homo,
                "total_hetero": total_hetero,
            },
            timeout=3600,
        )

    # Apply search filtering
    if search_term:

        def matches(p):
            return (
                search_term in p["patient_id"].lower()
                or search_term in p["genotype"].lower()
                or search_term in p["gender"].lower()
                or search_term in p["diagnosis"].lower()
            )

        data_all = list(filter(matches, data_all))
        data_homo = list(filter(matches, data_homo))
        data_hetero = list(filter(matches, data_hetero))

    # Pagination function
    def paginate(data):
        total = len(data)
        total_pages = (total + per_page - 1) // per_page
        pages = [data[i * per_page : (i + 1) * per_page] for i in range(total_pages)]
        return {"pages": pages, "total": total, "total_pages": total_pages}

    # Prepare result
    if preload:
        result = {
            "variant_key": unique_key,
            "homo_count": total_homo,
            "hetero_count": total_hetero,
            "result": {
                "all": paginate(data_all),
                "homo": paginate(data_homo),
                "hetero": paginate(data_hetero),
            },
        }
    else:
        if filter_type == "homo":
            data = data_homo
        elif filter_type == "hetero":
            data = data_hetero
        else:
            data = data_all

        total = len(data)
        total_pages = (total + per_page - 1) // per_page
        start = (page - 1) * per_page
        end = start + per_page

        result = {
            "variant_key": unique_key,
            "homo_count": total_homo,
            "hetero_count": total_hetero,
            "result": {
                filter_type: {
                    "pages": [data[start:end]],
                    "total": total,
                    "total_pages": total_pages,
                }
            },
        }

    return JsonResponse(result)


@login_required
@require_GET
def get_patients_longread_ajax(request):
    """
    AJAX view to retrieve long-read patient genotype data for a variant.

    Accepts query parameters:
    - variant_id (variant identifier)
    - page (pagination page number)
    - filter (all, homozygous, heterozygous)
    - search (search term)
    - preload (boolean string for loading all pages)

    Uses caching and supports filtering, searching, pagination.
    Returns JSON with patient data grouped by genotype.
    """
    variant_id = request.GET.get("variant_id", "").strip()
    page = int(request.GET.get("page", 1))
    filter_type = request.GET.get("filter", "all")
    search_term = request.GET.get("search", "").lower()
    preload = request.GET.get("preload", "false").lower() == "true"
    per_page = 50

    if not variant_id:
        return JsonResponse({"error": "No variant_id provided"})

    cache_key = f"longread_patients_data:{variant_id}"
    cached_data = cache.get(cache_key)

    if cached_data:
        data_all = cached_data["data_all"]
        data_homo = cached_data["data_homo"]
        data_hetero = cached_data["data_hetero"]
        total_homo = cached_data["total_homo"]
        total_hetero = cached_data["total_hetero"]
    else:
        try:
            variant = LongReadVariantV2.objects.get(variant_id=variant_id)
        except LongReadVariantV2.DoesNotExist:
            return JsonResponse({"error": "Variant not found"})

        genotype_qs = LongReadGenotypeV2.objects.select_related("patient").filter(
            variant=variant
        )

        data_all = []
        data_homo = []
        data_hetero = []
        total_homo = 0
        total_hetero = 0

        # Process genotype records
        for entry in genotype_qs.iterator(chunk_size=100):
            pid = entry.patient.patient_id
            gender = getattr(entry.patient, "gender", "")
            diagnosis = getattr(entry.patient, "diagnosis", "")
            genotype = entry.genotype

            patient_data = {
                "patient_id": pid,
                "genotype": genotype,
                "gender": gender,
                "diagnosis": diagnosis,
            }

            if genotype == "1/1":
                data_homo.append(patient_data)
                total_homo += 1
            elif genotype == "0/1":
                data_hetero.append(patient_data)
                total_hetero += 1

            data_all.append(patient_data)

        # Cache data for 1 hour
        cache.set(
            cache_key,
            {
                "data_all": data_all,
                "data_homo": data_homo,
                "data_hetero": data_hetero,
                "total_homo": total_homo,
                "total_hetero": total_hetero,
            },
            timeout=3600,
        )

    # Filter by search term if given
    if search_term:

        def matches(p):
            return (
                search_term in p["patient_id"].lower()
                or search_term in p["genotype"].lower()
                or search_term in p.get("gender", "").lower()
                or search_term in p.get("diagnosis", "").lower()
            )

        data_all = list(filter(matches, data_all))
        data_homo = list(filter(matches, data_homo))
        data_hetero = list(filter(matches, data_hetero))

    # Pagination helper
    def paginate(data):
        total = len(data)
        total_pages = (total + per_page - 1) // per_page
        pages = [data[i * per_page : (i + 1) * per_page] for i in range(total_pages)]
        return {"pages": pages, "total": total, "total_pages": total_pages}

    # Prepare response data based on preload or filter/page request
    if preload:
        result = {
            "variant_id": variant_id,
            "homo_count": total_homo,
            "hetero_count": total_hetero,
            "result": {
                "all": paginate(data_all),
                "homo": paginate(data_homo),
                "hetero": paginate(data_hetero),
            },
        }
    else:
        if filter_type == "homo":
            data = data_homo
        elif filter_type == "hetero":
            data = data_hetero
        else:
            data = data_all

        total = len(data)
        total_pages = (total + per_page - 1) // per_page
        start = (page - 1) * per_page
        end = start + per_page
        result = {
            "variant_id": variant_id,
            "homo_count": total_homo,
            "hetero_count": total_hetero,
            "result": {
                filter_type: {
                    "pages": [data[start:end]],
                    "total": total,
                    "total_pages": total_pages,
                }
            },
        }

    return JsonResponse(result)
