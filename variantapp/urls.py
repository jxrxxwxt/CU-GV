from django.urls import path
from . import views
from .views import CustomLoginView


urlpatterns = [
    path("login/", CustomLoginView.as_view(), name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("", views.index, name="index"),
    path("variant_detail", views.variant_detail, name="variant_detail"),
    path("get_patients", views.get_patients_ajax, name="get_patients"),
    path(
        "get_variant_annotation_ajax",
        views.get_variant_annotation_ajax,
        name="get_variant_annotation_ajax",
    ),
    path(
        "get_patients_longread_ajax",
        views.get_patients_longread_ajax,
        name="get_patients_longread_ajax",
    ),
]