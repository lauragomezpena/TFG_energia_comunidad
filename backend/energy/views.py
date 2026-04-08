from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Reading, Home
from .serializers import ReadingSerializer, HomeSerializer

class HomeListView(generics.ListAPIView):
    serializer_class = HomeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Admin can see all, owners can see only theirs
        user = self.request.user
        if user.role == 'admin':
            return Home.objects.all()
        return Home.objects.filter(owner=user)

class ReadingListView(generics.ListAPIView):
    serializer_class = ReadingSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    # We will remove pagination for now so recharts can get the full dataset easily,
    # or handle it in the frontend. If data is 89k rows, we should send just what is needed!
    # Let's keep default pagination but we might need a large page size for a time-series chart.
    # We will let frontend figure it out, or we provide an unpaginated endpoint for the chart.

    def get_queryset(self):
        user = self.request.user
        # Filtering by user's homes
        if user.role == 'admin':
            queryset = Reading.objects.all()
        else:
            queryset = Reading.objects.filter(home__owner=user)
        
        # Opcional: Filtrar por casa si viene en query params ("?home_id=X")
        home_id = self.request.query_params.get('home_id')
        if home_id:
            queryset = queryset.filter(home_id=home_id)
            
        return queryset.order_by('timestamp')
